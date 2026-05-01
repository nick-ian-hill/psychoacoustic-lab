import { describe, it, expect } from 'vitest';
import { calculateEnvelope } from '../audio/synthesis.js';

describe('Envelope Validation - Ramps & Guards', () => {
  const durationSec = 1.0;
  const attackMs = 100;
  const releaseMs = 100;
  const attackSec = attackMs / 1000;

  describe('Linear Ramps', () => {
    const env = { attackMs, releaseMs, type: 'linear' as const };

    it('should be 0.0 at t=0', () => {
      expect(calculateEnvelope(0, durationSec, env)).toBe(0);
    });

    it('should be 0.5 at midpoint of linear attack', () => {
      expect(calculateEnvelope(attackSec / 2, durationSec, env)).toBeCloseTo(0.5, 5);
    });

    it('should be 1.0 at end of attack', () => {
      expect(calculateEnvelope(attackSec, durationSec, env)).toBe(1.0);
    });

    it('should be 1.0 during steady state', () => {
      expect(calculateEnvelope(0.5, durationSec, env)).toBe(1.0);
    });

    it('should be 0.5 at midpoint of linear release', () => {
      expect(calculateEnvelope(durationSec - (attackSec / 2), durationSec, env)).toBeCloseTo(0.5, 5);
    });
  });

  describe('Cosine Ramps (Raised Cosine)', () => {
    const env = { attackMs, releaseMs, type: 'cosine' as const };

    it('should follow 0.5 * (1 - cos(pi * t/T))', () => {
      // At 1/4 of the way through attack: 0.5 * (1 - cos(pi/4))
      // cos(pi/4) = 0.7071
      // 0.5 * (1 - 0.7071) = 0.1464
      const t = attackSec / 4;
      const expected = 0.5 * (1 - Math.cos(Math.PI * 0.25));
      expect(calculateEnvelope(t, durationSec, env)).toBeCloseTo(expected, 5);
    });

    it('should be 0.5 at midpoint of cosine attack', () => {
      // 0.5 * (1 - cos(pi/2)) = 0.5 * (1 - 0) = 0.5
      expect(calculateEnvelope(attackSec / 2, durationSec, env)).toBeCloseTo(0.5, 5);
    });
  });

  describe('Guard Conditions', () => {
    const env = { attackMs: 10, releaseMs: 10 };

    it('should be exactly 0.0 for t < 0', () => {
      expect(calculateEnvelope(-0.001, durationSec, env)).toBe(0);
    });

    it('should be exactly 0.0 for t > duration', () => {
      expect(calculateEnvelope(durationSec + 0.001, durationSec, env)).toBe(0);
    });
  });
});
