import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

/**
 * This audit verifies if onset_asynchrony supports sub-sample precision.
 * For pure tones, timing differences manifest as phase interference.
 */
describe('Robot Observer - Onset Asynchrony Precision Audit', () => {
  const sampleRate = 44100;
  const freq = 1000;
  
  it('should achieve sub-sample precision for onset_asynchrony via phase interference', () => {
    // 10 microseconds is ~0.44 samples at 44.1kHz.
    // If quantized to samples, it becomes 0 samples (perfect sync).
    const delayMs = 0.01; 
    
    const config: any = {
      type: 'multi_component',
      durationMs: 100,
      components: [
        { frequency: freq, levelDb: 0, ear: 'left' }
      ],
      globalEnvelope: { attackMs: 0, releaseMs: 0 }
    };

    const perturbation = {
      type: 'onset_asynchrony' as const,
      delayMs: delayMs
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

    // If quantized to 0 samples, left[0] will be exactly 0 (sin(0)).
    // If phase-compensated, left[0] will be sin(-2 * PI * freq * 10us).
    const firstSample = left[0];
    const expectedValue = Math.sin(-2 * Math.PI * freq * (delayMs / 1000));

    // We expect the first sample to reflect the sub-sample shift
    expect(Math.abs(firstSample), 'Onset asynchrony was floored! The carrier phase was not shifted for sub-sample delay.').toBeGreaterThan(0);
    expect(firstSample).toBeCloseTo(expectedValue, 5);
  });
});
