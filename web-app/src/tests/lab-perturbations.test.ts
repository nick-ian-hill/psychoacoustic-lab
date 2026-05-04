import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Perturbation Validation - Mathematical Correctness & Resolution', () => {
  const sampleRate = 44100;
  const rng = () => 0.5;

  describe('Perturbation Types (Mathematical Correctness)', () => {
    it('spectral_profile: should only affect the target frequency component', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [
          { frequency: 1000, levelDb: 0 },
          { frequency: 2000, levelDb: 0 }
        ]
      };

      const perturbations: any[] = [{
        type: 'spectral_profile',
        targetFrequency: 2000,
        deltaDb: -20
      }];

      const { left } = synthesizeMultiComponent(config, sampleRate, rng, perturbations);
      
      // RMS of 1k (0dB) = 0.707
      // RMS of 2k (-20dB) = 0.0707
      // Combined RMS should be sqrt(0.707^2 + 0.0707^2) approx 0.7105
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      expect(rms).toBeCloseTo(0.7105, 3);
    });

    it('mistuning: should shift the frequency of a component', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0 }]
      };

      const perturbations: any[] = [{
        type: 'mistuning',
        targetFrequency: 1000,
        deltaPercent: 10 // 1000 -> 1100 Hz
      }];

      const { left } = synthesizeMultiComponent(config, sampleRate, rng, perturbations);
      
      // Period at 1000Hz = 44.1 samples
      // Period at 1100Hz = 44100 / 1100 = 40.09 samples
      const getPeriod = (samples: Float32Array) => {
          let i = 0;
          while (i < samples.length - 1 && !(samples[i] <= 0 && samples[i+1] > 0)) i++;
          const p1 = i;
          i++;
          while (i < samples.length - 1 && !(samples[i] <= 0 && samples[i+1] > 0)) i++;
          return i - p1;
      };

      const period = getPeriod(left);
      expect(period).toBe(40);
    });

    it('onset_asynchrony: should delay a specific component', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [
          { frequency: 1000, levelDb: 0, onsetDelayMs: 0 },
          { frequency: 2000, levelDb: 0, onsetDelayMs: 0 }
        ]
      };

      const perturbations: any[] = [{
        type: 'onset_asynchrony',
        targetFrequency: 1000,
        delayMs: 50
      }];

      // With 1000Hz delayed by 50ms, only 2000Hz is active for first 50ms
      const { left } = synthesizeMultiComponent(config, sampleRate, rng, perturbations);
      
      const startIdx = Math.floor(0.02 * sampleRate);
      const endIdx = Math.floor(0.03 * sampleRate);
      let maxAmp = 0;
      for (let i = startIdx; i < endIdx; i++) maxAmp = Math.max(maxAmp, Math.abs(left[i]));
      
      expect(maxAmp).toBeCloseTo(1.0, 2);
    });

    it('am_depth: should modify the depth of an existing AM modulator', () => {
      const config = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 100,
        envelope: { attackMs: 0, releaseMs: 0 },
        modulators: [{ type: 'AM', depth: 0.5, rateHz: 10 }]
      };

      const perturbations: any[] = [{
        type: 'am_depth',
        deltaDepth: 0.5 // 0.5 + 0.5 = 1.0 depth
      }];

      const { left } = synthesizeNoise(config, sampleRate, () => 0.5, perturbations);
      
      const sampleIdx = Math.floor(0.075 * sampleRate);
      const window = 10;
      let maxInWindow = 0;
      for (let i = sampleIdx - window; i < sampleIdx + window; i++) {
          maxInWindow = Math.max(maxInWindow, Math.abs(left[i]));
      }
      expect(maxInWindow).toBeLessThan(0.01);
    });

    it('phase_shift: should apply a phase shift to a component', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, phaseDegrees: 0 }]
      };

      // Test 90 degree shift (sine -> cosine)
      const { left: left90 } = synthesizeMultiComponent(config, sampleRate, rng, [{
        type: 'phase_shift',
        targetFrequency: 1000,
        deltaDegrees: 90
      }]);
      expect(left90[0]).toBeCloseTo(1.0, 5);

      // Test 180 degree shift (inversion)
      const { left: left180 } = synthesizeMultiComponent(config, sampleRate, rng, [{
        type: 'phase_shift',
        targetFrequency: 1000,
        deltaDegrees: 180
      }]);
      
      // At t=44.1/4 samples (approx 11 samples), sine(1000Hz) is at peak (1.0)
      // Inverted sine should be at -1.0
      const peakIdx = Math.floor(sampleRate / 4000); // 1/4 cycle of 1000Hz
      expect(left180[peakIdx]).toBeCloseTo(-1.0, 2);
    });
  });

  describe('Targeting & Resolution', () => {
    it('stimulusIndex: should target only the specific generator in the stimuli array', () => {
      const gen1 = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0 }]
      };
      const gen2 = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 2000, levelDb: 0 }]
      };

      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: -20,
        stimulusIndex: 1 // Only target gen2 (2000Hz)
      }];

      const res1 = synthesizeMultiComponent(gen1, sampleRate, rng, perturbations, 0, undefined, undefined, 0);
      const res2 = synthesizeMultiComponent(gen2, sampleRate, rng, perturbations, 0, undefined, undefined, 1);

      const rms1 = Math.sqrt(res1.left.reduce((a, b) => a + b * b, 0) / res1.left.length);
      const rms2 = Math.sqrt(res2.left.reduce((a, b) => a + b * b, 0) / res2.left.length);

      expect(rms1).toBeCloseTo(0.707, 3);
      expect(rms2).toBeCloseTo(0.0707, 3);
    });

    it('Adaptive Resolution: should resolve { adaptive: true } using provided adaptiveValue', () => {
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0 }]
      };
      
      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: { adaptive: true }
      }];

      const adaptiveValue = -12;
      const { left } = synthesizeMultiComponent(config, sampleRate, rng, perturbations, adaptiveValue);
      
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRMS = Math.pow(10, -12 / 20) / Math.sqrt(2);
      
      expect(rms).toBeCloseTo(expectedRMS, 3);
    });

    it('Random Resolution: should resolve Random Uniform perturbations', () => {
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0 }]
      };
      
      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: { type: 'uniform', min: -20, max: -20 } // effectively fixed at -20
      }];

      const { left } = synthesizeMultiComponent(config, sampleRate, () => 0.5, perturbations);
      
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRMS = Math.pow(10, -20 / 20) / Math.sqrt(2);
      expect(rms).toBeCloseTo(expectedRMS, 3);
    });

    it('Random Resolution: should resolve Random Choice perturbations', () => {
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0 }]
      };
      
      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: { type: 'choice', values: [-10, -20, -30] }
      }];

      // rng() returns 0.5. 0.5 * 3 = 1.5 -> floor -> 1. values[1] = -20.
      const { left } = synthesizeMultiComponent(config, sampleRate, () => 0.5, perturbations);
      
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRMS = Math.pow(10, -20 / 20) / Math.sqrt(2);
      
      expect(rms).toBeCloseTo(expectedRMS, 3);
    });
  });
});
