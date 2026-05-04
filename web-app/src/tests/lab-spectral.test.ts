import { describe, it, expect } from 'vitest';
import { generateFFTNoise } from '../audio/fft.js';
import { synthesizeNoise } from '../audio/synthesis.js';

describe('Spectral Validation - Noise & Filters', () => {
  const sampleRate = 44100;
  const durationSamples = 16384; // Power of 2 for clean FFT analysis

  // Helper to calculate RMS of a signal
  const calculateRMS = (samples: Float32Array) => {
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    return Math.sqrt(sumSq / samples.length);
  };

  // Helper to compute magnitude spectrum using a simple DFT for validation
  // Only computes specific bins to save time
  const getMagnitudeAtFreq = (samples: Float32Array, targetFreq: number, sr: number) => {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < samples.length; n++) {
      const angle = (2 * Math.PI * targetFreq * n) / sr;
      real += samples[n] * Math.cos(angle);
      imag += samples[n] * Math.sin(angle);
    }
    return Math.sqrt(real * real + imag * imag) / samples.length;
  };

  describe('Noise Synthesis', () => {
    it('should generate white noise with RMS = 1.0', () => {
      const noise = generateFFTNoise(durationSamples, sampleRate, 'white');
      expect(calculateRMS(noise)).toBeCloseTo(1.0, 5);
    });

    it('should respect brick-wall band limiting', () => {
      const duration = 16384;
      const binLow = 400;  // approx 1076 Hz
      const binHigh = 800; // approx 2153 Hz
      const lowFreq = binLow * (sampleRate / duration);
      const highFreq = binHigh * (sampleRate / duration);
      
      const noise = generateFFTNoise(duration, sampleRate, 'white', { lowFreq, highFreq });

      // Energy below cutoff should be EXACTLY zero (or near float precision)
      const energyBelow = getMagnitudeAtFreq(noise, (binLow - 100) * (sampleRate / duration), sampleRate);
      expect(energyBelow).toBeLessThan(0.000001);

      // Energy above cutoff should be EXACTLY zero
      const energyAbove = getMagnitudeAtFreq(noise, (binHigh + 100) * (sampleRate / duration), sampleRate);
      expect(energyAbove).toBeLessThan(0.000001);

      // Energy inside should be significant
      const energyInside = getMagnitudeAtFreq(noise, (binLow + binHigh) / 2 * (sampleRate / duration), sampleRate);
      expect(energyInside).toBeGreaterThan(0.001);
    });

    it('should follow spectral tilt (Pink Noise: -3dB/octave)', () => {
      const duration = 131072;
      const bin1 = 1024;
      const bin2 = 2048; // Exactly one octave up
      const freq1 = bin1 * (sampleRate / duration);
      const freq2 = bin2 * (sampleRate / duration);
      
      let sumRatio = 0;
      const realizations = 5;
      for (let i = 0; i < realizations; i++) {
        const noise = generateFFTNoise(duration, sampleRate, 'pink', undefined, () => Math.random());
        const mag1 = getMagnitudeAtFreq(noise, freq1, sampleRate);
        const mag2 = getMagnitudeAtFreq(noise, freq2, sampleRate);
        sumRatio += mag2 / mag1;
      }
      
      // Amplitude ratio for -3dB is 1/sqrt(2) approx 0.707
      expect(sumRatio / realizations).toBeCloseTo(0.707, 0.05);
    });

    it('should follow spectral tilt (Brown Noise: -6dB/octave)', () => {
      const duration = 131072;
      const bin1 = 1024;
      const bin2 = 2048; // Exactly one octave up
      const freq1 = bin1 * (sampleRate / duration);
      const freq2 = bin2 * (sampleRate / duration);
      
      let sumRatio = 0;
      const realizations = 5;
      for (let i = 0; i < realizations; i++) {
        const noise = generateFFTNoise(duration, sampleRate, 'brown', undefined, () => Math.random());
        const mag1 = getMagnitudeAtFreq(noise, freq1, sampleRate);
        const mag2 = getMagnitudeAtFreq(noise, freq2, sampleRate);
        sumRatio += mag2 / mag1;
      }
      
      // Amplitude ratio for -6dB is 0.5
      expect(sumRatio / realizations).toBeCloseTo(0.5, 0.05);
    });

    it('should support complex combination (band-limited + ear routing + level)', () => {
      const gen: any = {
        type: 'noise',
        noiseType: 'white',
        levelDb: -6, // approx 0.5 amplitude
        durationMs: 10,
        envelope: { attackMs: 0, releaseMs: 0 },
        bandLimit: { lowFreq: 1000, highFreq: 2000 },
        ear: 'left'
      };
      const { left, right } = synthesizeNoise(gen, sampleRate, () => 0.5);
      
      // Check ear routing
      expect(left.some(v => v !== 0)).toBe(true);
      expect(right.every(v => v === 0)).toBe(true);
      
      // Check level (RMS)
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      expect(rms).toBeCloseTo(0.5, 2);
    });
    
    it('should respect onsetDelayMs for noise stimuli with samples-accurate precision', () => {
      const delayMs = 10.5;
      const gen: any = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 5,
        envelope: { attackMs: 0, releaseMs: 0 },
        onsetDelayMs: delayMs
      };
      const { left } = synthesizeNoise(gen, sampleRate, () => 0.5);
      
      const delaySamples = Math.floor((delayMs / 1000) * sampleRate); // approx 463
      
      // All samples within delay should be exactly 0
      let maxInDelay = 0;
      for (let i = 0; i < delaySamples; i++) maxInDelay = Math.max(maxInDelay, Math.abs(left[i]));
      expect(maxInDelay).toBe(0);
      
      // Sample immediately after delay should be non-zero
      expect(Math.abs(left[delaySamples + 1])).toBeGreaterThan(0);
    });
  });
});
