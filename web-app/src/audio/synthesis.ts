import type { Perturbation, CalibrationProfile } from "../../../shared/schema";
import { generateFFTNoise } from "./fft";

export interface SynthesisResult {
  left: Float32Array;
  right: Float32Array;
}

export function calculateEnvelope(t: number, durationSec: number, env: { attackMs: number; releaseMs: number; type?: "linear" | "cosine" }) {
  const attack = env.attackMs / 1000;
  const release = env.releaseMs / 1000;
  const type = env.type || "cosine";

  if (t <= 0 || t >= durationSec) return 0;

  if (t < attack && attack > 0) {
    const fraction = t / attack;
    return type === "cosine" ? 0.5 * (1 - Math.cos(Math.PI * fraction)) : fraction;
  }

  if (t > durationSec - release && release > 0) {
    const fraction = (durationSec - t) / release;
    return type === "cosine" ? 0.5 * (1 - Math.cos(Math.PI * fraction)) : fraction;
  }

  return 1;
}

export function getCalibrationOffset(frequency: number, calibration?: CalibrationProfile): number {
  if (!calibration || calibration.points.length === 0) return 0;

  const pts = calibration.points.sort((a, b) => a.frequency - b.frequency);

  if (frequency <= pts[0].frequency) return pts[0].offsetDb;
  if (frequency >= pts[pts.length - 1].frequency) return pts[pts.length - 1].offsetDb;

  for (let i = 0; i < pts.length - 1; i++) {
    if (frequency >= pts[i].frequency && frequency <= pts[i + 1].frequency) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const logF = Math.log10(frequency);
      const logF1 = Math.log10(p1.frequency);
      const logF2 = Math.log10(p2.frequency);
      const fraction = (logF - logF1) / (logF2 - logF1);
      return p1.offsetDb + fraction * (p2.offsetDb - p1.offsetDb);
    }
  }
  return 0;
}

export function normalizeStereo(left: Float32Array, right: Float32Array) {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }

  if (peak > 0.9) {
    const scale = 0.9 / peak;
    for (let i = 0; i < left.length; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }
}

function resolveValue(val: any, adaptiveValue: number | undefined, rng: () => number): number {
  if (typeof val === 'number') return val;
  if (val.adaptive) return adaptiveValue || 0;
  if (val.type === 'uniform') {
    return val.min + rng() * (val.max - val.min);
  }
  return 0;
}

export function synthesizeMultiComponent(
  gen: any,
  sampleRate: number,
  rng: () => number,
  perturbations?: Perturbation[],
  adaptiveValue?: number,
  calibration?: CalibrationProfile
): SynthesisResult {
  // 1. Pre-resolve onsets to determine the required buffer range and normalization offset.
  // This ensures that lead-asynchrony (negative onsetMs) doesn't cause clicks by starting at index 0 without a ramp.
  let minOnsetMs = 0;
  let maxOnsetMs = 0;

  gen.components.forEach((comp: any) => {
    let onset = comp.onsetDelayMs || 0;
    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "onset_asynchrony" && p.targetFrequency === comp.frequency) {
          onset += resolveValue((p as any).delayMs, adaptiveValue, rng);
        }
        if (p.type === "itd" && (!p.targetFrequency || p.targetFrequency === comp.frequency)) {
          const mode = (p as any).mode || "both";
          if (mode === "envelope" || mode === "both") {
            onset += resolveValue((p as any).deltaMicroseconds, adaptiveValue, rng) / 1000;
          }
        }
      }
    }
    minOnsetMs = Math.min(minOnsetMs, onset);
    maxOnsetMs = Math.max(maxOnsetMs, onset);
  });

  // Calculate Global Gain for this interval (e.g., for roving)
  let intervalGainDb = 0;
  if (perturbations) {
    perturbations.forEach(p => {
      if (p.type === "gain") {
        intervalGainDb += resolveValue(p.deltaDb, adaptiveValue, rng);
      }
    });
  }
  const intervalGainAmp = Math.pow(10, intervalGainDb / 20);

  // Normalize all onsets relative to the earliest one starting at 0ms.
  // The total span of the buffer must cover the stimulus duration PLUS the spread of the component onsets.
  const globalOffsetMs = -minOnsetMs;
  const globalDurationMs = gen.durationMs + (maxOnsetMs - minOnsetMs);
  const globalDurationSamples = Math.ceil(globalDurationMs / 1000 * sampleRate);

  const left = new Float32Array(globalDurationSamples);
  const right = new Float32Array(globalDurationSamples);

  for (let compIdx = 0; compIdx < gen.components.length; compIdx++) {
    const comp = gen.components[compIdx];
    const baseFreq = comp.frequency;
    const basePhase = (comp.phaseDegrees || 0) * Math.PI / 180;
    const compEar = comp.ear || "both";

    // 2. Resolve perturbations for each ear separately
    const resolveEarState = (targetEar: "left" | "right") => {
      let freq = baseFreq;
      let phase = basePhase;
      let ampOffsetDb = 0;
      let onsetOffsetMs = 0;

      if (perturbations) {
        for (const p of perturbations) {
          const pAny = p as any;
          const matchesFrequency = !pAny.targetFrequency || pAny.targetFrequency === comp.frequency;
          if (!matchesFrequency) continue;

          const pEar = pAny.ear || "both";
          const earMatch = pEar === "both" || pEar === targetEar;
          if (!earMatch) continue;

          if (p.type === "spectral_profile") {
            ampOffsetDb += resolveValue(p.deltaDb, adaptiveValue, rng);
          } else if (p.type === "mistuning") {
            const delta = resolveValue(p.deltaPercent, adaptiveValue, rng);
            freq *= (1 + delta / 100);
          } else if (p.type === "phase_shift") {
            const delta = resolveValue(p.deltaDegrees, adaptiveValue, rng);
            phase += delta * Math.PI / 180;
          } else if (p.type === "gain") {
            ampOffsetDb += resolveValue(p.deltaDb, adaptiveValue, rng);
          } else if (p.type === "onset_asynchrony") {
            onsetOffsetMs += resolveValue(p.delayMs, adaptiveValue, rng);
          } else if (p.type === "itd") {
            const mode = pAny.mode || "both";
            const itdUs = resolveValue(pAny.deltaMicroseconds, adaptiveValue, rng);

            if (mode === "fine_structure" || mode === "both") {
              // ΔPhase = 360 * f * Δt
              const deltaPhaseDeg = 360 * freq * (itdUs / 1000000);
              phase += deltaPhaseDeg * Math.PI / 180;
            }
            if (mode === "envelope" || mode === "both") {
              onsetOffsetMs += itdUs / 1000;
            }
          }
        }
      }

      const calibrationOffset = getCalibrationOffset(freq, calibration);
      const finalAmp = Math.pow(10, (comp.levelDb + ampOffsetDb + calibrationOffset) / 20) * intervalGainAmp;

      return { freq, phase, amp: finalAmp, onsetMs: (comp.onsetDelayMs || 0) + onsetOffsetMs };
    };

    const leftState = resolveEarState("left");
    const rightState = resolveEarState("right");

    const durationSec = gen.durationMs / 1000;
    const durationSamples = Math.floor(durationSec * sampleRate);
    const dt = 1 / sampleRate;

    // We use the same onset for buffer range calculation as before, 
    // but now it's normalized relative to the earliest global onset.
    const leftOnsetSamples = Math.floor((leftState.onsetMs + globalOffsetMs) / 1000 * sampleRate);
    const rightOnsetSamples = Math.floor((rightState.onsetMs + globalOffsetMs) / 1000 * sampleRate);

    // Phase accumulators for each ear
    let leftPhase = leftState.phase;
    let rightPhase = rightState.phase;

    // Optimization: find the overall range covered by this component across both ears
    const startI = Math.max(0, Math.min(leftOnsetSamples, rightOnsetSamples));
    const endI = Math.min(globalDurationSamples, Math.max(leftOnsetSamples, rightOnsetSamples) + durationSamples + 1);

    for (let i = startI; i < endI; i++) {
      const tL = (i - leftOnsetSamples) / sampleRate;
      const tR = (i - rightOnsetSamples) / sampleRate;

      // Handle Left Ear
      if ((compEar === "left" || compEar === "both") && tL >= 0 && tL <= durationSec) {
        const envelope = calculateEnvelope(tL, durationSec, gen.globalEnvelope);
        let instFreq = leftState.freq;
        let instAmp = leftState.amp;

        if (comp.modulators) {
          for (const mod of comp.modulators) {
            const modVal = Math.sin(2 * Math.PI * mod.rateHz * tL + (mod.phaseDegrees || 0) * Math.PI / 180);
            if (mod.type === "AM") instAmp *= (1 + mod.depth * modVal);
            else if (mod.type === "FM") instFreq += mod.depth * modVal;
          }
        }
        left[i] += instAmp * Math.sin(leftPhase) * envelope;
        leftPhase += 2 * Math.PI * instFreq * dt;
      }

      // Handle Right Ear
      if ((compEar === "right" || compEar === "both") && tR >= 0 && tR <= durationSec) {
        const envelope = calculateEnvelope(tR, durationSec, gen.globalEnvelope);
        let instFreq = rightState.freq;
        let instAmp = rightState.amp;

        if (comp.modulators) {
          for (const mod of comp.modulators) {
            const modVal = Math.sin(2 * Math.PI * mod.rateHz * tR + (mod.phaseDegrees || 0) * Math.PI / 180);
            if (mod.type === "AM") instAmp *= (1 + mod.depth * modVal);
            else if (mod.type === "FM") instFreq += mod.depth * modVal;
          }
        }
        right[i] += instAmp * Math.sin(rightPhase) * envelope;
        rightPhase += 2 * Math.PI * instFreq * dt;
      }
    }
  }

  return { left, right };
}

export function synthesizeNoise(
  gen: any,
  sampleRate: number,
  rng: () => number,
  perturbations?: Perturbation[],
  adaptiveValue?: number,
  calibration?: CalibrationProfile
): SynthesisResult {
  const duration = gen.durationMs / 1000;
  const targetSamples = Math.ceil(duration * sampleRate);
  const left = new Float32Array(targetSamples);
  const right = new Float32Array(targetSamples);
  const baseAmp = Math.pow(10, gen.levelDb / 20);
  const ear = gen.ear || "both";

  // Calculate Global Gain for this interval (e.g., for roving)
  let intervalGainDb = 0;
  if (perturbations) {
    perturbations.forEach(p => {
      if (p.type === "gain") {
        intervalGainDb += resolveValue(p.deltaDb, adaptiveValue, rng);
      }
    });
  }
  const intervalGainAmp = Math.pow(10, intervalGainDb / 20);

  const baseNoise = generateFFTNoise(targetSamples, sampleRate, gen.noiseType, gen.bandLimit, rng, (f) => getCalibrationOffset(f, calibration));

  // 1. Resolve perturbations for each ear separately
  const resolveEarState = (targetEar: "left" | "right") => {
    let gainDb = 0;
    let amDepthOffset = 0;

    if (perturbations) {
      for (const p of perturbations) {
        const pAny = p as any;
        const pEar = pAny.ear || "both";
        const earMatch = pEar === "both" || pEar === targetEar;
        if (!earMatch) continue;

        if (p.type === "gain") {
          gainDb += resolveValue(p.deltaDb, adaptiveValue, rng);
        } else if (p.type === "am_depth") {
          amDepthOffset += resolveValue(p.deltaDepth, adaptiveValue, rng);
        }
      }
    }

    const totalGainAmp = Math.pow(10, gainDb / 20) * intervalGainAmp;
    const amMod = gen.modulators?.find((m: any) => m.type === "AM");
    const finalAmDepth = amMod
      ? Math.max(0, Math.min(1, (amMod.depth || 0) + amDepthOffset))
      : (amDepthOffset > 0 ? amDepthOffset : 0);

    return {
      gain: totalGainAmp,
      amDepth: finalAmDepth,
      amRate: amMod?.rateHz || 8, // Default rate if just applying depth
      amPhase: (amMod?.phaseDegrees || 0) * Math.PI / 180
    };
  };

  const leftState = resolveEarState("left");
  const rightState = resolveEarState("right");
  const durationSec = gen.durationMs / 1000;

  // 2. Optimized Sample Loop
  for (let i = 0; i < targetSamples; i++) {
    const t = i / sampleRate;
    const envelope = calculateEnvelope(t, durationSec, gen.envelope);
    const noiseBase = baseNoise[i] * baseAmp * envelope;

    // Handle Left Ear
    if (ear === "left" || ear === "both") {
      let currentAmp = leftState.gain;
      if (leftState.amDepth > 0) {
        currentAmp *= (1 + leftState.amDepth * Math.sin(2 * Math.PI * leftState.amRate * t + leftState.amPhase));
      }
      let sample = noiseBase * currentAmp;
      left[i] = sample;
    }

    // Handle Right Ear
    if (ear === "right" || ear === "both") {
      let currentAmp = rightState.gain;
      if (rightState.amDepth > 0) {
        currentAmp *= (1 + rightState.amDepth * Math.sin(2 * Math.PI * rightState.amRate * t + rightState.amPhase));
      }
      let sample = noiseBase * currentAmp;
      right[i] = sample;
    }
  }

  return { left, right };
}
