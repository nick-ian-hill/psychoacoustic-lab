import { describe, it, expect } from 'vitest';
import { applyFIR, synthesizeFilteredNoise } from '../audio/synthesis.js';

describe('FIR Filter Validation', () => {
  const sampleRate = 44100;

  describe('applyFIR function', () => {
    it('should return identity for [1] coefficients', () => {
      const input = new Float32Array([1, 2, 3, 4, 5]);
      const fir = [1];
      const output = applyFIR(input, fir);
      expect(Array.from(output)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should delay signal for [0, 1] coefficients', () => {
      const input = new Float32Array([1, 2, 3, 4, 5]);
      const fir = [0, 1];
      const output = applyFIR(input, fir);
      expect(Array.from(output)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should scale signal for [0.5] coefficients', () => {
      const input = new Float32Array([1, 2, 3, 4, 5]);
      const fir = [0.5];
      const output = applyFIR(input, fir);
      expect(Array.from(output)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    });

    it('should apply moving average for [0.5, 0.5]', () => {
      const input = new Float32Array([1, 2, 3, 4, 5]);
      const fir = [0.5, 0.5];
      const output = applyFIR(input, fir);
      // [ 1*0.5 + 0*0.5, 2*0.5 + 1*0.5, 3*0.5 + 2*0.5 ... ]
      expect(Array.from(output)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
    });
  });

  describe('synthesizeFilteredNoise', () => {
    it('should apply FIR to white noise', () => {
      // Use a simple delay FIR to verify integration
      const fir = [0, 0, 0, 1]; // 3 sample delay
      const gen = {
        type: 'filtered_noise',
        levelDb: 0,
        durationMs: 1,
        envelope: { attackMs: 0, releaseMs: 0 },
        firCoefficients: fir
      };

      // Since noise is random, we compare the filtered noise with its base (which we can't easily get)
      // BUT we can check if the first 3 samples are zero.
      const { left } = synthesizeFilteredNoise(gen, sampleRate, Math.random);
      
      expect(left[0]).toBe(0);
      expect(left[1]).toBe(0);
      expect(left[2]).toBe(0);
      expect(Math.abs(left[3])).toBeGreaterThan(0);
    });
  });
});
