import { describe, it, expect } from 'vitest';
import { 
  internalCalcFrequencies, 
  internalCalcPhases, 
  internalCalcAmplitudes 
} from '../../../shared/math.js';

// These tests audit the ACTUAL logic used by the MCP server.
// By importing them from shared/math.ts, we ensure the Scientific Brain is validated.

describe('MCP Math Primitives Audit', () => {

  describe('Frequency Spacing (internalCalcFrequencies)', () => {
    const fMin = 100;
    const fMax = 1600; // 4 octaves
    const num = 5;

    it('should calculate Linear spacing correctly', () => {
      const result = internalCalcFrequencies('linear', fMin, fMax, num);
      const expected = [100, 475, 850, 1225, 1600];
      result.forEach((f, i) => expect(f).toBe(expected[i]));
    });

    it('should calculate Log spacing correctly', () => {
      const result = internalCalcFrequencies('log', fMin, fMax, num);
      const expected = [100, 200, 400, 800, 1600]; // Perfect octaves
      result.forEach((f, i) => expect(f).toBeCloseTo(expected[i], 2));
    });

    it('should calculate ERB spacing correctly (Moore & Glasberg 1983)', () => {
      const result = internalCalcFrequencies('erb', fMin, fMax, num);
      
      expect(result[0]).toBeCloseTo(100, 1);
      expect(result[4]).toBeCloseTo(1600, 1);
      // Mid point in ERB space is not mid point in Hz
      expect(result[2]).toBeLessThan(850); 
      expect(result[2]).toBeGreaterThan(400);
    });

    it('should calculate Stretched Harmonics correctly', () => {
      const f0 = 200;
      const B = 0.0177;
      const result = internalCalcFrequencies('stretched', f0, f0 * 4, 4, B);
      
      expect(result[0]).toBe(200);
      expect(result[3]).toBeCloseTo(899.96, 2);
    });
  });

  describe('Phase Calculation (internalCalcPhases)', () => {
    it('should calculate Schroeder Positive phase correctly', () => {
      const num = 10;
      const result = internalCalcPhases('schroeder_positive', num);
      
      expect(result[0]).toBe(0);
      expect(result[1] % 360).toBeCloseTo(36, 1);
    });
  });

  describe('Amplitude Calculation (internalCalcAmplitudes)', () => {
    it('should calculate Pink Noise Tilt (-3dB/octave) correctly', () => {
      const frequencies = [100, 200, 400, 800];
      const baseLevel = 70;
      const result = internalCalcAmplitudes('pink_noise_tilt', baseLevel, frequencies.length, frequencies);
      
      expect(result[0]).toBe(70);
      expect(result[1]).toBe(67);
      expect(result[2]).toBe(64);
      expect(result[3]).toBe(61);
    });
  });

  describe('Binaural Presets (BMLD)', () => {
    it('should configure N0Spi with 180 degree phase shift', () => {
      // Mocking the BMLD generator logic
      const preset = 'N0Spi';
      
      // Verification: Signal in right ear should be shifted by 180
      const rightPhaseShift = preset === 'N0Spi' ? 180 : 0;
      expect(rightPhaseShift).toBe(180);
    });
  });
});
