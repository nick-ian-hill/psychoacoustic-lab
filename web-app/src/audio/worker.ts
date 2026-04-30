import seedrandom from "seedrandom";
import { synthesizeMultiComponent, synthesizeNoise, synthesizeFilteredNoise, normalizeStereo } from "./synthesis";
import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

interface RenderTrialMessage {
  id: string;
  intervals: { generators: StimulusGenerator[]; perturbations?: Perturbation[] }[];
  isiMs: number;
  sampleRate: number;
  seed: number;
  adaptiveValue?: number;
  calibration?: CalibrationProfile;
  globalLevelDb?: number;
}

function generateSharedEnvelope(durationSec: number, sampleRate: number, bandwidthHz: number, rng: () => number): Float32Array {
  const numSamples = Math.ceil(durationSec * sampleRate);
  const noise = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    noise[i] = rng() * 2 - 1;
  }
  
  // Simple one-pole low-pass filter for the envelope
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * bandwidthHz);
  const alpha = dt / (rc + dt);
  const filtered = new Float32Array(numSamples);
  let prev = 0;
  for (let i = 0; i < numSamples; i++) {
    filtered[i] = prev + alpha * (noise[i] - prev);
    prev = filtered[i];
  }
  
  // Normalize to peak 1
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(filtered[i]));
  if (peak > 0) {
    for (let i = 0; i < numSamples; i++) filtered[i] /= peak;
  }
  return filtered;
}

self.onmessage = async (event: MessageEvent<RenderTrialMessage>) => {
  const { id, intervals, isiMs, sampleRate, seed, adaptiveValue, calibration, globalLevelDb } = event.data;

  const renderedIntervals: { left: Float32Array; right: Float32Array }[] = [];
  
  for (let intervalIdx = 0; intervalIdx < intervals.length; intervalIdx++) {
    const interval = intervals[intervalIdx];
    const intervalRng = seedrandom(`${seed}-${intervalIdx}`);

    // Pre-scan for shared envelopes
    const sharedEnvelopes = new Map<string, Float32Array>();
    const scanForEnvelopes = (gen: any) => {
      if (gen.modulators) {
        gen.modulators.forEach((mod: any) => {
          if (mod.sharedEnvelopeId && !sharedEnvelopes.has(mod.sharedEnvelopeId)) {
            // Use rateHz as bandwidth, default to 10Hz if missing
            const bw = mod.rateHz || 10;
            // Use a specific seed for this shared envelope so it's correlated across generators but unique across trials
            const envRng = seedrandom(`${seed}-${intervalIdx}-env-${mod.sharedEnvelopeId}`);
            sharedEnvelopes.set(mod.sharedEnvelopeId, generateSharedEnvelope(gen.durationMs / 1000, sampleRate, bw, envRng));
          }
        });
      }
      if (gen.components) {
        gen.components.forEach((comp: any) => {
          if (comp.modulators) {
             comp.modulators.forEach((mod: any) => {
                if (mod.sharedEnvelopeId && !sharedEnvelopes.has(mod.sharedEnvelopeId)) {
                   const bw = mod.rateHz || 10;
                   const envRng = seedrandom(`${seed}-${intervalIdx}-env-${mod.sharedEnvelopeId}`);
                   sharedEnvelopes.set(mod.sharedEnvelopeId, generateSharedEnvelope(gen.durationMs / 1000, sampleRate, bw, envRng));
                }
             });
          }
        });
      }
    };
    interval.generators.forEach(scanForEnvelopes);

    const layers: { left: Float32Array; right: Float32Array }[] = [];
    let maxLength = 0;

    interval.generators.forEach((gen, genIndex) => {
      let result;
      if (gen.type === "multi_component") {
        result = synthesizeMultiComponent(gen, sampleRate, intervalRng, interval.perturbations, adaptiveValue, calibration, sharedEnvelopes, genIndex);
      } else if (gen.type === "noise") {
        result = synthesizeNoise(gen, sampleRate, intervalRng, interval.perturbations, adaptiveValue, calibration, sharedEnvelopes, genIndex);
      } else if (gen.type === "filtered_noise") {
        result = synthesizeFilteredNoise(gen, sampleRate, intervalRng, interval.perturbations, adaptiveValue, calibration, sharedEnvelopes, genIndex);
      }
      
      if (result) {
        layers.push(result);
        maxLength = Math.max(maxLength, result.left.length);
      }
    });

    const intervalLeft = new Float32Array(maxLength);
    const intervalRight = new Float32Array(maxLength);

    for (const layer of layers) {
      for (let i = 0; i < layer.left.length; i++) {
        intervalLeft[i] += layer.left[i];
        intervalRight[i] += layer.right[i];
      }
    }

    renderedIntervals.push({ left: intervalLeft, right: intervalRight });
  }

  const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
  const totalLength = renderedIntervals.reduce((acc, buf) => acc + buf.left.length, 0) + 
                     (intervals.length - 1) * isiSamples;

  const finalLeft = new Float32Array(totalLength);
  const finalRight = new Float32Array(totalLength);

  let offset = 0;
  for (let i = 0; i < renderedIntervals.length; i++) {
    const { left, right } = renderedIntervals[i];
    finalLeft.set(left, offset);
    finalRight.set(right, offset);
    
    offset += left.length;
    if (i < renderedIntervals.length - 1) {
      offset += isiSamples;
    }
  }

  normalizeStereo(finalLeft, finalRight);

  if (globalLevelDb !== undefined && globalLevelDb !== 0) {
    const gain = Math.pow(10, globalLevelDb / 20);
    for (let i = 0; i < finalLeft.length; i++) {
      finalLeft[i] *= gain;
      finalRight[i] *= gain;
    }
  }

  self.postMessage({
    id,
    left: finalLeft,
    right: finalRight,
    intervalLengths: renderedIntervals.map(r => r.left.length)
  }, [finalLeft.buffer, finalRight.buffer] as any);
};


