import { describe, it, expect } from 'vitest';
import { generateFFTNoise } from '../audio/fft.js';

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
  });
});
