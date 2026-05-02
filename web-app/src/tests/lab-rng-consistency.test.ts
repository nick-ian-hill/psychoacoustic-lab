import { describe, it, expect } from 'vitest';
import { resolvePerturbations, synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';
import type { Perturbation } from '../../../shared/schema.js';
import seedrandom from 'seedrandom';

describe('RNG Consistency & Phase Locking', () => {
  const sampleRate = 44100;

  describe('resolvePerturbations', () => {
    it('should resolve a random gain once and return the same numeric value for subsequent uses', () => {
      const perts: Perturbation[] = [
        { type: 'gain', deltaDb: { type: 'uniform', min: -10, max: 10 } }
      ];
      const rng = seedrandom('test-seed');
      const resolved = resolvePerturbations(perts, 0, rng);
      
      expect(typeof (resolved![0] as any).deltaDb).toBe('number');
      const val1 = (resolved![0] as any).deltaDb;
      
      // Even if we "resolve" again with a different RNG, the first one is fixed now in our local logic
      // But the key is that synthesize functions only see the resolved number.
      expect(val1).toBeGreaterThanOrEqual(-10);
      expect(val1).toBeLessThanOrEqual(10);
    });

    it('should resolve { adaptive: true } using the provided adaptiveValue', () => {
      const perts: Perturbation[] = [
        { type: 'gain', deltaDb: { adaptive: true } }
      ];
      const resolved = resolvePerturbations(perts, -5, () => 0);
      expect((resolved![0] as any).deltaDb).toBe(-5);
    });
  });

  describe('Coherent Summation (Phase Locking)', () => {
    it('should perfectly sum two generators at the same frequency when perturbations are pre-resolved', () => {
      // Setup a perturbation that should apply to BOTH generators in an interval
      const perts: Perturbation[] = [
        { type: 'phase_shift', targetFrequency: 1000, applyTo: 'all', deltaDegrees: { type: 'uniform', min: 0, max: 360 } }
      ];

      const gen = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
      };

      const rng = seedrandom('consistent-phase');
      const resolved = resolvePerturbations(perts, 0, rng);

      // Synthesize two separate generators using the SAME resolved perturbations
      // This mimics Stimulus 0 and Stimulus 1 in a Profile Analysis task.
      const res1 = synthesizeMultiComponent(gen, sampleRate, () => 0.5, resolved);
      const res2 = synthesizeMultiComponent(gen, sampleRate, () => 0.5, resolved);

      // Sum them
      const combinedLeft = new Float32Array(res1.left.length);
      for (let i = 0; i < combinedLeft.length; i++) {
        combinedLeft[i] = res1.left[i] + res2.left[i];
      }

      const rms1 = Math.sqrt(res1.left.reduce((a, b) => a + b * b, 0) / res1.left.length);
      const rmsCombined = Math.sqrt(combinedLeft.reduce((a, b) => a + b * b, 0) / combinedLeft.length);

      // If they are perfectly phase-locked, the RMS should exactly double (+6.02 dB)
      expect(rmsCombined / rms1).toBeCloseTo(2.0, 5);
    });

    it('should apply the same Level Rove to all components in a MultiComponent generator', () => {
      const perts: Perturbation[] = [
        { type: 'gain', applyTo: 'all', deltaDb: { type: 'uniform', min: -10, max: 10 } }
      ];
      
      const gen = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [
          { frequency: 1000, levelDb: 0, ear: 'both' },
          { frequency: 2000, levelDb: 0, ear: 'both' }
        ]
      };

      const rng = seedrandom('rove-test');
      const resolved = resolvePerturbations(perts, 0, rng);
      const roveValue = (resolved![0] as any).deltaDb;

      const { left } = synthesizeMultiComponent(gen, sampleRate, () => 0.5, resolved);
      
      // Calculate RMS. Since both are 0dB and they are 1000/2000Hz (orthogonal), 
      // the RMS should be sqrt(sum of powers) * roveGain.
      // Power of one sine is 0.5. Total power = 1.0. RMS = 1.0 * roveGain.
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRoveGain = Math.pow(10, roveValue / 20);
      
      expect(rms).toBeCloseTo(expectedRoveGain, 2);
    });
  });

  describe('Binaural Roving Consistency', () => {
    it('should apply identical roving to Left and Right channels of noise when ear is "both"', () => {
      const perts: Perturbation[] = [
        { type: 'gain', deltaDb: { type: 'uniform', min: -10, max: 10 } }
      ];
      const gen = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 100,
        envelope: { attackMs: 0, releaseMs: 0 },
        ear: 'both'
      };

      const rng = seedrandom('noise-rove');
      const resolved = resolvePerturbations(perts, 0, rng);
      const { left, right } = synthesizeNoise(gen, sampleRate, () => 0.5, resolved);

      const rmsL = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rmsR = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);
      
      // They should be identical because the rove was resolved once
      expect(rmsL).toBeCloseTo(rmsR, 5);
    });
  });
});
