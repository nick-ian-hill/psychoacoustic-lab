import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Sample Rate Independence - 44.1k vs 48k', () => {
  const rng = () => 0.5;
  const config = {
    type: 'multi_component' as const,
    durationMs: 100, // 0.1 seconds
    globalEnvelope: { attackMs: 0, releaseMs: 0 },
    components: [{ frequency: 1000, levelDb: 0, ear: 'both' as const }]
  };

  it('should scale buffer length correctly', () => {
    const res44 = synthesizeMultiComponent(config, 44100, rng);
    const res48 = synthesizeMultiComponent(config, 48000, rng);

    // 0.1s * 44100 = 4410. (+1 for the engine's zero-guard)
    expect(res44.left.length).toBe(4411);
    
    // 0.1s * 48000 = 4800. (+1)
    expect(res48.left.length).toBe(4801);
  });

  it('should maintain consistent frequency (cycles per ms)', () => {
    const res44 = synthesizeMultiComponent(config, 44100, rng);
    const res48 = synthesizeMultiComponent(config, 48000, rng);

    // At 1000Hz, we expect 1 cycle every 1ms.
    // At 44.1kHz, 1 cycle = 44.1 samples.
    // At 48.0kHz, 1 cycle = 48.0 samples.

    const getFirstZeroCrossing = (samples: Float32Array) => {
        let i = 0;
        while (i < samples.length - 1 && !(samples[i] <= 0 && samples[i+1] > 0)) i++;
        return i;
    };

    const first44 = getFirstZeroCrossing(res44.left);
    const next44 = getFirstZeroCrossing(res44.left.slice(first44 + 1)) + first44 + 1;
    const period44 = next44 - first44;

    const first48 = getFirstZeroCrossing(res48.left);
    const next48 = getFirstZeroCrossing(res48.left.slice(first48 + 1)) + first48 + 1;
    const period48 = next48 - first48;

    expect(period44).toBe(44); // 44.1 floored
    expect(period48).toBe(48); // Exactly 48
  });

  it('should scale ITD sample-offsets correctly', () => {
    const itdUs = 1000; // 1ms
    const noiseConfig = {
      type: 'noise' as const,
      noiseType: 'white' as const,
      levelDb: 0,
      durationMs: 100,
      envelope: { attackMs: 0, releaseMs: 0 }
    };

    const perturbations = [{
      type: 'itd' as const,
      ear: 'left' as const,
      mode: 'both' as const,
      deltaMicroseconds: itdUs
    }];

    // Note: synthesizeNoise and synthesizeMultiComponent use the same ITD logic.
    // We use noise because the first sample is guaranteed to be non-zero (unlike a 0-phase sine).
    const res44 = synthesizeNoise(noiseConfig, 44100, () => Math.random(), perturbations, itdUs);
    const res48 = synthesizeNoise(noiseConfig, 48000, () => Math.random(), perturbations, itdUs);

    const getDelay = (samples: Float32Array) => {
        let i = 0;
        // Find first sample where noise is clearly active
        while (i < samples.length && Math.abs(samples[i]) < 0.0001) i++;
        return i;
    };

    const delay44 = getDelay(res44.left);
    const delay48 = getDelay(res48.left);

    expect(delay44).toBe(44); // 1ms * 44.1kHz = 44.1 samples
    expect(delay48).toBe(48); // 1ms * 48.0kHz = 48.0 samples
  });
});
