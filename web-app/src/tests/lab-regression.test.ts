import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';
import seedrandom from 'seedrandom';

describe('Gold Standard Regression - Synthesis Stability', () => {
  const sampleRate = 44100;

  // Helper to calculate a stable "hash" (sum of samples) for regression
  const calculateChecksum = (left: Float32Array, right: Float32Array) => {
    let sum = 0;
    for (let i = 0; i < left.length; i++) {
      sum += Math.abs(left[i]) * (i + 1);
      sum += Math.abs(right[i]) * (i + 1);
    }
    return sum;
  };

  it('Regression: Tone-in-Noise (N0S0)', () => {
    const rng = seedrandom('tone-in-noise-fixed-seed');
    
    const noiseGen = {
      type: 'noise',
      noiseType: 'white',
      bandLimit: { lowFreq: 500, highFreq: 1500 },
      levelDb: -20,
      durationMs: 50,
      envelope: { attackMs: 5, releaseMs: 5 }
    };

    const toneGen = {
      type: 'multi_component',
      durationMs: 50,
      globalEnvelope: { attackMs: 5, releaseMs: 5 },
      components: [{ frequency: 1000, levelDb: -25, ear: 'both' }]
    };

    const noiseResult = synthesizeNoise(noiseGen, sampleRate, rng);
    const toneResult = synthesizeMultiComponent(toneGen, sampleRate, rng);

    const left = new Float32Array(noiseResult.left.length);
    const right = new Float32Array(noiseResult.right.length);
    for (let i = 0; i < left.length; i++) {
      left[i] = noiseResult.left[i] + toneResult.left[i];
      right[i] = noiseResult.right[i] + toneResult.right[i];
    }

    const checksum = calculateChecksum(left, right);
    
    // This value is what the current engine produces with this seed.
    // If it changes, it means the synthesis math or RNG application has changed.
    expect(checksum).toBeCloseTo(369845.99, 0); 
  });

  it('Regression: Binaural Masking Level Difference (N0Spi)', () => {
    const rng = seedrandom('bmld-fixed-seed');
    
    const noiseGen = {
      type: 'noise',
      noiseType: 'white',
      levelDb: -20,
      durationMs: 50,
      envelope: { attackMs: 0, releaseMs: 0 },
      ear: 'both' // N0: noise is same in both ears
    };

    const tonePerturbations: any[] = [{
      type: 'phase_shift',
      targetFrequency: 500,
      deltaDegrees: 180,
      ear: 'right' // Spi: tone is out of phase
    }];

    const toneGen = {
      type: 'multi_component',
      durationMs: 50,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 500, levelDb: -25, ear: 'both' }]
    };

    const noiseResult = synthesizeNoise(noiseGen, sampleRate, rng);
    const toneResult = synthesizeMultiComponent(toneGen, sampleRate, rng, tonePerturbations);

    const left = new Float32Array(noiseResult.left.length);
    const right = new Float32Array(noiseResult.right.length);
    for (let i = 0; i < left.length; i++) {
      left[i] = noiseResult.left[i] + toneResult.left[i];
      right[i] = noiseResult.right[i] + toneResult.right[i];
    }

    // Verify Spi: left and right tone components should be inverted
    // We can check the toneResult directly
    expect(toneResult.left[100]).toBeCloseTo(-toneResult.right[100], 5);

    const checksum = calculateChecksum(left, right);
    expect(checksum).toBeCloseTo(414824.03, 0);
  });
});
