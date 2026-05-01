import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Binaural Precision - ITD and Phase Accuracy', () => {
  const sampleRate = 48000; // Use 48kHz for cleaner microsecond math

  describe('Pure Tone ITD (fine_structure)', () => {
    it('should apply correct phase shift for 500us ITD at 500Hz', () => {
      // 500us at 500Hz is exactly 1/4 cycle (90 degrees or pi/2 radians)
      const freq = 500;
      const itdUs = 500;
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: freq, levelDb: 0, ear: 'both' }]
      };
      const perturbations: any[] = [{
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'fine_structure',
        ear: 'right' // Delay right ear moves sound to left? 
        // In the code: resolveEarState("right") applies itdUs. 
        // phase -= continuousPhaseRad;
      }];

      const { left, right } = synthesizeMultiComponent(config, sampleRate, Math.random, perturbations);

      // Check phase difference at a stable point (e.g., sample 1000)
      const idx = 1000;
      // For a sine wave sin(2*pi*f*t + phase)
      // If right is delayed by phase shift theta, right[i] = sin(omega*t - theta)
      // So left[i] leads right[i]
      
      // At freq=500Hz, 500us is 90 deg.
      // left = sin(x), right = sin(x - pi/2) = -cos(x)
      // When left is at peak (1.0), right should be at zero.
      
      // Find a peak in left
      let peakIdx = idx;
      while (peakIdx < idx + 100 && left[peakIdx] < 0.999) peakIdx++;
      
      expect(left[peakIdx]).toBeCloseTo(1.0, 2);
      expect(right[peakIdx]).toBeCloseTo(0.0, 1);
    });
  });

  describe('Pure Tone ITD (envelope)', () => {
    it('should delay the onset of the right ear by requested samples', () => {
      const freq = 1000;
      const itdUs = 1000; // 1ms = 48 samples at 48kHz
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 2, releaseMs: 2 },
        components: [{ frequency: freq, levelDb: 0, ear: 'both' }]
      };
      const perturbations: any[] = [{
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'envelope',
        ear: 'right'
      }];

      const { left, right } = synthesizeMultiComponent(config, sampleRate, Math.random, perturbations);

      // Find first non-zero sample
      let firstLeft = 0;
      while (Math.abs(left[firstLeft]) < 1e-6) firstLeft++;
      
      let firstRight = 0;
      while (Math.abs(right[firstRight]) < 1e-6) firstRight++;

      const sampleDelay = firstRight - firstLeft;
      expect(sampleDelay).toBe(48);
    });
  });

  describe('Noise ITD (Broadband)', () => {
    it('should shift the entire noise buffer by requested samples', () => {
      const itdUs = 2000; // 2ms = 96 samples at 48kHz
      const config = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 10,
        envelope: { attackMs: 0, releaseMs: 0 },
        ear: 'both'
      };
      const perturbations: any[] = [{
        type: 'itd',
        deltaMicroseconds: itdUs,
        ear: 'right'
      }];

      const { left, right } = synthesizeNoise(config, sampleRate, Math.random, perturbations);

      // Cross-correlation to find delay
      let maxCorr = -1;
      let bestLag = -1;
      for (let lag = 0; lag < 200; lag++) {
        let corr = 0;
        let count = 0;
        for (let i = 0; i < left.length - lag; i++) {
          corr += left[i] * right[i + lag];
          count++;
        }
        corr /= count;
        if (corr > maxCorr) {
          maxCorr = corr;
          bestLag = lag;
        }
      }

      expect(bestLag).toBe(96);
    });
  });
});
