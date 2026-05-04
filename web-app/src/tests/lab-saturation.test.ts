import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, normalizeStereo } from '../audio/synthesis.js';

describe('Scientific Guard - Saturation & Normalization Pipeline', () => {
  const sampleRate = 44100;

  it('should ensure the full synthesis pipeline (primitive + normalization) prevents clipping', () => {
    // 1. Setup a generator that will definitely exceed 0dBFS (summing to 2.0 amplitude)
    const config = {
      type: 'multi_component' as const,
      durationMs: 10,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [
        { frequency: 1000, levelDb: 0, phaseDegrees: 0, ear: 'both' as const },
        { frequency: 1000, levelDb: 0, phaseDegrees: 0, ear: 'both' as const }
      ]
    };

    // 2. Run the primitive synthesis (which allows > 1.0 for processing flexibility)
    const { left, right } = synthesizeMultiComponent(config, sampleRate, Math.random);
    
    let preNormPeak = 0;
    for (let i = 0; i < left.length; i++) {
        preNormPeak = Math.max(preNormPeak, Math.abs(left[i]));
    }
    expect(preNormPeak).toBeGreaterThan(1.0); 

    // 3. Apply the global normalization (as done in worker.ts before sending back)
    normalizeStereo(left, right);

    let postNormPeak = 0;
    for (let i = 0; i < left.length; i++) {
        postNormPeak = Math.max(postNormPeak, Math.abs(left[i]));
    }

    // 4. Verify the 0.9 safety margin is respected for consumer DAC headroom
    expect(postNormPeak).toBeCloseTo(0.9, 5);
  });
});
