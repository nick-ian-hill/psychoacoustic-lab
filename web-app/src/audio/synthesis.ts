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

  if (t < 0 || t > durationSec) return 0;

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
    if (frequency >= pts[i].frequency && frequency <= pts[i+1].frequency) {
      const p1 = pts[i];
      const p2 = pts[i+1];
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
  
  const resolvedOnsets = gen.components.map((comp: any) => {
    let onset = comp.onsetDelayMs || 0;
    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "onset_asynchrony" && p.targetFrequency === comp.frequency) {
          onset += resolveValue((p as any).delayMs, adaptiveValue, rng);
        }
      }
    }
    minOnsetMs = Math.min(minOnsetMs, onset);
    maxOnsetMs = Math.max(maxOnsetMs, onset);
    return onset;
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
    let freq = comp.frequency;
    let phase = (comp.phaseDegrees || 0) * Math.PI / 180;
    // Apply normalization offset to the resolved onset
    let onsetMs = resolvedOnsets[compIdx] + globalOffsetMs;
    const ear = comp.ear || "both";

    // 2. Resolve remaining Runtime Perturbations (amplitude, phase, frequency)
    let pertAmpOffset = 0;
    if (perturbations) {
      for (const p of perturbations) {
        const pAny = p as any;
        const matchesFrequency = !pAny.targetFrequency || pAny.targetFrequency === comp.frequency;
        
        if (p.type === "spectral_profile" && matchesFrequency) {
          pertAmpOffset += resolveValue(p.deltaDb, adaptiveValue, rng);
        }
        if (p.type === "mistuning" && matchesFrequency) {
          const delta = resolveValue(p.deltaPercent, adaptiveValue, rng);
          freq *= (1 + delta / 100);
        }
        if (p.type === "phase_shift" && matchesFrequency) {
          const earMatch = !p.ear || p.ear === ear || (p.ear === 'both' && ear === 'both');
          if (earMatch) {
            const delta = resolveValue(p.deltaDegrees, adaptiveValue, rng);
            phase += delta * Math.PI / 180;
          }
        }
      }
    }

    const onsetSamples = Math.floor((onsetMs / 1000) * sampleRate);
    const durationSamples = Math.floor((gen.durationMs / 1000) * sampleRate);
    const calibrationOffset = getCalibrationOffset(freq, calibration);
    const finalDigitalDb = comp.levelDb + pertAmpOffset + calibrationOffset;
    const baseAmp = Math.pow(10, finalDigitalDb / 20) * intervalGainAmp;

    // Use a phase accumulator for perfectly smooth frequency modulation
    let currentPhase = phase;
    const dt = 1 / sampleRate;
    const durationSec = gen.durationMs / 1000;

    // OPTIMIZATION: Only iterate over the specific range where this component exists.
    // We add a 1-sample safety margin to endI to ensure no clipping at the boundary.
    const startI = Math.max(0, onsetSamples);
    const endI = Math.min(globalDurationSamples, onsetSamples + durationSamples + 1);

    for (let i = startI; i < endI; i++) {
      const t = (i - onsetSamples) / sampleRate;
      const envelope = calculateEnvelope(t, durationSec, gen.globalEnvelope);
      
      let instFreq = freq;
      let instAmp = baseAmp;

      if (comp.modulators) {
        for (const mod of comp.modulators) {
          const modVal = Math.sin(2 * Math.PI * mod.rateHz * t + (mod.phaseDegrees || 0) * Math.PI / 180);
          if (mod.type === "AM") {
            instAmp *= (1 + mod.depth * modVal);
          } else if (mod.type === "FM") {
            instFreq += mod.depth * modVal;
          }
        }
      }

      const sample = instAmp * Math.sin(currentPhase) * envelope;
      if (ear === "left" || ear === "both") left[i] += sample;
      if (ear === "right" || ear === "both") right[i] += sample;

      // Increment phase based on the instantaneous frequency
      currentPhase += 2 * Math.PI * instFreq * dt;
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

  const baseNoise = generateFFTNoise(targetSamples, sampleRate, gen.noiseType, gen.bandLimit, rng, (f) => getCalibrationOffset(f, calibration));

  // 1. Resolve all perturbations ONCE before the sample loop
  let intervalGainDb = 0;
  let dynamicAmDepth = 0;
  const tones: { amp: number, freq: number }[] = [];

  if (perturbations) {
    for (const p of perturbations) {
      if (p.type === "gain") {
        intervalGainDb += resolveValue(p.deltaDb, adaptiveValue, rng);
      } else if (p.type === "am_depth") {
        dynamicAmDepth += resolveValue(p.deltaDepth, adaptiveValue, rng);
      } else if (p.type === "spectral_profile") {
        const delta = resolveValue(p.deltaDb, adaptiveValue, rng);
        tones.push({
          freq: p.targetFrequency,
          amp: baseAmp * Math.pow(10, delta / 20)
        });
      }
    }
  }

  const intervalGainAmp = Math.pow(10, intervalGainDb / 20);
  const durationSec = gen.durationMs / 1000;
  const finalAmDepth = gen.modulators 
    ? Math.max(0, Math.min(1, (gen.modulators.find((m: any) => m.type === "AM")?.depth || 0) + dynamicAmDepth))
    : 0;
  const amRate = gen.modulators?.find((m: any) => m.type === "AM")?.rateHz || 0;
  const amPhase = (gen.modulators?.find((m: any) => m.type === "AM")?.phaseDegrees || 0) * Math.PI / 180;

  // 2. Optimized Sample Loop
  for (let i = 0; i < targetSamples; i++) {
    const t = i / sampleRate;
    const envelope = calculateEnvelope(t, durationSec, gen.envelope);
    let currentAmp = baseAmp * envelope * intervalGainAmp;
    
    if (finalAmDepth > 0) {
      const modVal = Math.sin(2 * Math.PI * amRate * t + amPhase);
      currentAmp *= (1 + finalAmDepth * modVal);
    }

    let sample = baseNoise[i] * currentAmp;

    // Add pre-calculated tones
    for (const tone of tones) {
      sample += tone.amp * envelope * Math.sin(2 * Math.PI * tone.freq * t);
    }
    
    if (ear === "left" || ear === "both") left[i] = sample;
    if (ear === "right" || ear === "both") right[i] = sample;
  }

  return { left, right };
}
