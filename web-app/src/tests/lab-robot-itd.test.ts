import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

/**
 * This audit verifies the sub-sample precision of the ITD implementation.
 * Human lateralization thresholds can be as low as 10 microseconds.
 * At 44.1kHz, one sample is ~22.7 microseconds.
 * If the engine floors ITD to the nearest sample, it will fail to lateralize
 * sub-sample differences.
 */
describe('Robot Observer - ITD Precision Audit', () => {
  const sampleRate = 44100;
  const freq = 500; // 500Hz has a period of 2000us.
  
  it('should achieve sub-sample precision for mode: "both" (True Lateralization)', () => {
    const itdUs = 15; // 15 microseconds is less than one sample (22.7us)
    
    const config: any = {
      type: 'multi_component',
      durationMs: 100,
      components: [{ frequency: freq, levelDb: -10, ear: 'both' }],
      globalEnvelope: { attackMs: 10, releaseMs: 10 }
    };

    const perturbation = {
      type: 'itd' as const,
      deltaMicroseconds: itdUs,
      mode: 'both' as const,
      ear: 'right' as const // Shift the right ear (lag = shift right)
    };

    const { left, right } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

    // Calculate cross-correlation or phase difference at the center of the stimulus
    // For a 500Hz tone, 15us ITD should result in a phase shift of:
    // (15 / 2000) * 360 = 2.7 degrees
    
    const startIdx = Math.floor(0.05 * sampleRate); // 50ms in
    const testLen = 100;
    
    let leftSum = 0;
    let rightSum = 0;
    for(let i = 0; i < testLen; i++) {
        leftSum += left[startIdx + i];
        rightSum += right[startIdx + i];
    }

    // If they are identical (floored to 0 samples), the difference will be 0.
    // We expect a tiny but measurable difference in the waveforms.
    let diff = 0;
    for(let i = 0; i < testLen; i++) {
        diff += Math.abs(left[startIdx + i] - right[startIdx + i]);
    }

    // CRITICAL: Under the current implementation (flooring), diff will be 0.
    // A scientifically valid engine must have diff > 0 for a 15us ITD.
    expect(diff, 'ITD of 15us was floored to 0 samples! Sub-sample precision is missing.').toBeGreaterThan(0);
  });
});
