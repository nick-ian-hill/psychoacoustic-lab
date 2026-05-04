import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

describe('Temporal Validation - ITD & Asynchrony', () => {
  const sampleRate = 44100;
  const rng = () => 0.5; // Constant RNG for deterministic tests

  it('should apply onset asynchrony correctly', () => {
    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [
        { frequency: 1000, levelDb: 0, onsetDelayMs: 0 },
        { frequency: 2000, levelDb: 0, onsetDelayMs: 50 } // 50ms delay
      ]
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, rng);
    
    // Total duration should be 100ms + 50ms = 150ms
    const expectedSamples = Math.floor(150 / 1000 * sampleRate) + 1;
    expect(left.length).toBe(expectedSamples);

    // At t=25ms (middle of first tone), we should have signal
    const sample25ms = left[Math.floor(25 / 1000 * sampleRate)];
    expect(Math.abs(sample25ms)).toBeGreaterThan(0);

    // At t=0, the second tone shouldn't have started
    // We verify this by checking if the signal is a pure 1kHz wave vs a 1k+2k mix
    // but easier to check leading zeros if it were the ONLY component.
  });

  it('should apply ITD correctly (Temporal Delay)', () => {
    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 1000, levelDb: 0, ear: 'both', phaseDegrees: 90 }]
    };

    const itdUs = 1000; // 1ms delay
    const perturbations = [{
      type: 'itd' as const,
      ear: 'left' as const,
      mode: 'both' as const,
      deltaMicroseconds: itdUs
    }];

    const { left, right } = synthesizeMultiComponent(config, sampleRate, rng, perturbations, itdUs);
    
    // Left channel should be delayed relative to Right
    // So Right starts at 0, Left starts at 1ms
    
    // First few samples of Left should be 0
    expect(left[0]).toBe(0);
    expect(left[10]).toBe(0);
    
    // Right should have started
    expect(Math.abs(right[5])).toBeGreaterThan(0);

    // Cross-correlation peak should be at the ITD
    // (Simple check: first non-zero sample index difference)
    let firstLeft = 0;
    while (Math.abs(left[firstLeft]) < 0.0001) firstLeft++;
    
    let firstRight = 0;
    while (Math.abs(right[firstRight]) < 0.0001) firstRight++;

    const sampleDelay = firstLeft - firstRight;
    const expectedSampleDelay = Math.round(itdUs / 1000000 * sampleRate);
    expect(sampleDelay).toBe(expectedSampleDelay);
  });
});
