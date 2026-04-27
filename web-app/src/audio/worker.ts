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
  // No shared top-level RNG. Each interval gets its own independently-seeded RNG
  // (see per-interval loop below) so that roving draws (applyTo:"all") are statistically
  // uncorrelated across intervals, regardless of internal synthesis complexity.

  const renderedIntervals: { left: Float32Array; right: Float32Array }[] = [];
  
  for (let intervalIdx = 0; intervalIdx < intervals.length; intervalIdx++) {
    const interval = intervals[intervalIdx];
    // Per-interval RNG: seeded from the trial-unique seed combined with the interval index.
    // This guarantees independent random streams per interval within a trial.
    const intervalRng = seedrandom(`${seed}-${intervalIdx}`);

    const layers: { left: Float32Array; right: Float32Array }[] = [];
    let maxLength = 0;

    // 1. Synthesize each layer independently
    for (const gen of interval.generators) {
      let result;
      if (gen.type === "multi_component") {
        result = synthesizeMultiComponent(gen, sampleRate, intervalRng, interval.perturbations, adaptiveValue, calibration);
      } else if (gen.type === "noise") {
        result = synthesizeNoise(gen, sampleRate, intervalRng, interval.perturbations, adaptiveValue, calibration);
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

  // Step 1: Normalize first — removes any synthesis-level clipping risk while preserving
  // all relative levels (ILD, spectral shape). This is purely a safety net.
  normalizeStereo(finalLeft, finalRight);

  // Step 2: Apply globalLevelDb as a post-normalization presentation-level trim.
  // Because normalization has already run, this cleanly scales the final output level
  // without interfering with calibrated component ratios. A large positive value here
  // may cause clipping at the DAC; that should be caught by evaluate_and_finalize_experiment.
  if (globalLevelDb !== undefined && globalLevelDb !== 0) {
    const gain = Math.pow(10, globalLevelDb / 20);
    for (let i = 0; i < finalLeft.length; i++) {
      finalLeft[i] *= gain;
      finalRight[i] *= gain;
    }
  }

  // Transfer the buffers and timing info to the main thread
  self.postMessage({
    id,
    left: finalLeft,
    right: finalRight,
    intervalLengths: renderedIntervals.map(r => r.left.length)
  }, [finalLeft.buffer, finalRight.buffer] as any);
};

