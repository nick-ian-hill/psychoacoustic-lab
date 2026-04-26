import type { Perturbation, CalibrationProfile } from "../../../shared/schema";
import { generateFFTNoise } from "./fft";

export interface SynthesisResult {
  left: Float32Array;
  right: Float32Array;
}

export function calculateEnvelope(t: number, durationSec: number, env: { attackMs: number; releaseMs: number }) {
  const attack = env.attackMs / 1000;
  const release = env.releaseMs / 1000;
  if (t < attack) return t / attack;
  if (t > durationSec - release) return (durationSec - t) / release;
  if (t > durationSec) return 0;
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

  if (peak > 1.0) {
    for (let i = 0; i < left.length; i++) {
      left[i] /= peak;
      right[i] /= peak;
    }
  }
}

export function synthesizeMultiComponent(
  gen: any,
  sampleRate: number,
  perturbations?: Perturbation[],
  adaptiveValue?: number,
  calibration?: CalibrationProfile
): SynthesisResult {
  // 1. Calculate Maximum Absolute Delay across all components (including perturbations)
  // to ensure the buffer is large enough for true ITD shifts.
  let maxDelayMs = 0;
  
  for (const comp of gen.components) {
    let compDelay = comp.onsetDelayMs || 0;
    
    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "onset_asynchrony" && p.targetFrequency === comp.frequency) {
          const delta = typeof p.delayMs === 'object' ? (adaptiveValue || 0) : p.delayMs;
          compDelay += delta;
        }
      }
    }
    maxDelayMs = Math.max(maxDelayMs, Math.abs(compDelay));
  }

  const globalDurationSamples = Math.ceil((gen.durationMs + maxDelayMs) / 1000 * sampleRate);
  const left = new Float32Array(globalDurationSamples);
  const right = new Float32Array(globalDurationSamples);

  for (const comp of gen.components) {
    let freq = comp.frequency;
    let phase = (comp.phaseDegrees || 0) * Math.PI / 180;
    // Base onset relative to the buffer start (0 is leading ear)
    let onsetMs = comp.onsetDelayMs || 0;
    const ear = comp.ear || "both";

    // 2. Resolve Runtime Perturbations
    let pertAmpOffset = 0;
    if (perturbations) {
      for (const p of perturbations) {
        if (p.targetFrequency === comp.frequency) {
          if (p.type === "spectral_profile") {
            const delta = typeof p.deltaDb === 'object' ? (adaptiveValue || 0) : p.deltaDb;
            pertAmpOffset += delta;
          }
          if (p.type === "mistuning") {
            const delta = typeof p.deltaPercent === 'object' ? (adaptiveValue || 0) : p.deltaPercent;
            freq *= (1 + delta / 100);
          }
          if (p.type === "onset_asynchrony") {
            const delta = typeof p.delayMs === 'object' ? (adaptiveValue || 0) : p.delayMs;
            onsetMs += delta;
          }
          if (p.type === "phase_shift") {
            const delta = typeof p.deltaDegrees === 'object' ? (adaptiveValue || 0) : p.deltaDegrees;
            phase += delta * Math.PI / 180;
          }
        }
      }
    }

    const onsetSamples = (onsetMs / 1000) * sampleRate;
    const calibrationOffset = getCalibrationOffset(freq, calibration);
    const finalDigitalDb = comp.levelDb + pertAmpOffset + calibrationOffset;
    const amp = Math.pow(10, finalDigitalDb / 20);

    // 3. Synthesis
    for (let i = 0; i < globalDurationSamples; i++) {
      // 't' is local time relative to the component onset
      const t = (i - onsetSamples) / sampleRate;
      
      // Only synthesize within the component's gated duration
      if (t < 0 || t > gen.durationMs / 1000) continue;

      const envelope = calculateEnvelope(t, gen.durationMs / 1000, gen.globalEnvelope);
      let currentAmp = amp * envelope;
      let currentFreq = freq;
      
      if (comp.modulators) {
        for (const mod of comp.modulators) {
          const modPhase = (mod.phaseDegrees || 0) * Math.PI / 180;
          const modVal = Math.sin(2 * Math.PI * mod.rateHz * t + modPhase);
          if (mod.type === "AM") {
            currentAmp *= (1 + mod.depth * modVal);
          } else if (mod.type === "FM") {
            currentFreq += mod.depth * modVal;
          }
        }
      }

      const sample = currentAmp * Math.sin(2 * Math.PI * currentFreq * t + phase);
      if (ear === "left" || ear === "both") left[i] += sample;
      if (ear === "right" || ear === "both") right[i] += sample;
    }
  }

  return { left, right };
}

export function synthesizeNoise(
  gen: any,
  sampleRate: number,
  rng: () => number,
  perturbations?: Perturbation[],
  adaptiveValue?: number
): SynthesisResult {
  const duration = gen.durationMs / 1000;
  const targetSamples = Math.ceil(duration * sampleRate);
  const left = new Float32Array(targetSamples);
  const right = new Float32Array(targetSamples);
  const amp = Math.pow(10, gen.levelDb / 20);
  const ear = gen.ear || "both";

  const baseNoise = generateFFTNoise(targetSamples, sampleRate, gen.noiseType, gen.bandLimit, rng);

  for (let i = 0; i < targetSamples; i++) {
    const t = i / sampleRate;
    const envelope = calculateEnvelope(t, gen.durationMs / 1000, gen.envelope);
    let currentAmp = amp * envelope;
    
    let dynamicAmDepth = 0;
    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "am_depth") {
          const delta = typeof p.deltaDepth === 'object' ? (adaptiveValue || 0) : p.deltaDepth;
          dynamicAmDepth += delta;
        }
      }
    }

    if (gen.modulators) {
      for (const mod of gen.modulators) {
        if (mod.type === "AM") {
          const modPhase = (mod.phaseDegrees || 0) * Math.PI / 180;
          const modVal = Math.sin(2 * Math.PI * mod.rateHz * t + modPhase);
          const finalDepth = Math.max(0, Math.min(1, mod.depth + dynamicAmDepth));
          currentAmp *= (1 + finalDepth * modVal);
        }
      }
    }

    let sample = baseNoise[i] * currentAmp;

    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "spectral_profile") {
          const targetFreq = 1000;
          const delta = typeof p.deltaDb === 'object' ? (adaptiveValue || 0) : p.deltaDb;
          const toneAmp = Math.pow(10, delta / 20) * (amp / 10);
          sample += toneAmp * envelope * Math.sin(2 * Math.PI * targetFreq * t);
        }
      }
    }
    
    if (ear === "left" || ear === "both") left[i] = sample;
    if (ear === "right" || ear === "both") right[i] = sample;
  }

  return { left, right };
}
