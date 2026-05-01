import { describe, it, expect } from 'vitest';
import { synthesizeNoise } from '../audio/synthesis.js';
import seedrandom from 'seedrandom';

describe('Reproducibility - Seeding Integrity', () => {
  const sampleRate = 44100;

  it('should generate identical samples when given the same seed', () => {
    const config = {
      type: 'noise',
      noiseType: 'white',
      levelDb: 0,
      durationMs: 100,
      envelope: { attackMs: 10, releaseMs: 10 }
    };

    const seed = 'psychoacoustics-rock';
    
    const rng1 = seedrandom(seed);
    const res1 = synthesizeNoise(config, sampleRate, rng1);

    const rng2 = seedrandom(seed);
    const res2 = synthesizeNoise(config, sampleRate, rng2);

    // Every single sample must be bit-identical
    for (let i = 0; i < res1.left.length; i++) {
      if (res1.left[i] !== res2.left[i]) {
        throw new Error(`Sample mismatch at index ${i}: ${res1.left[i]} !== ${res2.left[i]}`);
      }
    }
    
    expect(res1.left).toEqual(res2.left);
  });

  it('should generate different samples when given different seeds', () => {
    const config = {
      type: 'noise',
      noiseType: 'white',
      levelDb: 0,
      durationMs: 100,
      envelope: { attackMs: 10, releaseMs: 10 }
    };

    const res1 = synthesizeNoise(config, sampleRate, seedrandom('seed-a'));
    const res2 = synthesizeNoise(config, sampleRate, seedrandom('seed-b'));

    // Should NOT be identical
    let identicalCount = 0;
    for (let i = 0; i < res1.left.length; i++) {
      if (res1.left[i] === res2.left[i]) identicalCount++;
    }
    
    expect(identicalCount).toBeLessThan(res1.left.length * 0.1);
  });
});
