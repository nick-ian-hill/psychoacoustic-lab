import seedrandom from "seedrandom";
import { synthesizeMultiComponent, synthesizeNoise, normalizeStereo } from "./synthesis";
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

self.onmessage = async (event: MessageEvent<RenderTrialMessage>) => {
  const { id, intervals, isiMs, sampleRate, seed, adaptiveValue, calibration, globalLevelDb } = event.data;
  const rng = seedrandom(seed.toString());

  const renderedIntervals: { left: Float32Array; right: Float32Array }[] = [];
  
  for (const interval of intervals) {
    const layers: { left: Float32Array; right: Float32Array }[] = [];
    let maxLength = 0;

    // 1. Synthesize each layer independently
    for (const gen of interval.generators) {
      let result;
      if (gen.type === "multi_component") {
        result = synthesizeMultiComponent(gen, sampleRate, interval.perturbations, adaptiveValue, calibration);
      } else if (gen.type === "noise") {
        result = synthesizeNoise(gen, sampleRate, rng, interval.perturbations, adaptiveValue);
      }
      
      if (result) {
        layers.push(result);
        maxLength = Math.max(maxLength, result.left.length);
      }
    }

    // 2. Sum the layers into a single interval buffer
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

  // Apply Global Level Offset (if any)
  if (globalLevelDb !== undefined && globalLevelDb !== 0) {
    const gain = Math.pow(10, globalLevelDb / 20);
    for (let i = 0; i < finalLeft.length; i++) {
      finalLeft[i] *= gain;
      finalRight[i] *= gain;
    }
  }

  // Perform Final Normalization (prevents clipping while preserving ILD)
  normalizeStereo(finalLeft, finalRight);

  // Transfer the buffers to the main thread (zero-copy)
  self.postMessage({
    id,
    left: finalLeft,
    right: finalRight
  }, [finalLeft.buffer, finalRight.buffer] as any);
};
