import seedrandom from "seedrandom";
import { synthesizeMultiComponent, synthesizeNoise } from "./synthesis";
import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

interface RenderTrialMessage {
  id: string;
  intervals: { generator: StimulusGenerator; perturbations?: Perturbation[] }[];
  isiMs: number;
  sampleRate: number;
  seed: number;
  adaptiveValue?: number;
  calibration?: CalibrationProfile;
}

self.onmessage = async (event: MessageEvent<RenderTrialMessage>) => {
  const { id, intervals, isiMs, sampleRate, seed, adaptiveValue, calibration } = event.data;
  const rng = seedrandom(seed.toString());

  const renderedIntervals: { left: Float32Array; right: Float32Array }[] = [];
  
  for (const interval of intervals) {
    const gen = interval.generator;
    if (gen.type === "multi_component") {
      renderedIntervals.push(synthesizeMultiComponent(gen, sampleRate, interval.perturbations, adaptiveValue, calibration));
    } else if (gen.type === "noise") {
      renderedIntervals.push(synthesizeNoise(gen, sampleRate, rng, interval.perturbations, adaptiveValue));
    }
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

  // Transfer the buffers to the main thread (zero-copy)
  self.postMessage({
    id,
    left: finalLeft,
    right: finalRight
  }, [finalLeft.buffer, finalRight.buffer] as any);
};
