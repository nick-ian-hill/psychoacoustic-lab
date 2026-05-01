import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Ear Routing - Channel Isolation', () => {
  const sampleRate = 44100;
  const rng = () => 0.5;

  describe('Pure Tone Isolation', () => {
    it('should route ear: "left" only to the left channel', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'left' }]
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, rng);

      // Left should have signal
      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      expect(leftRMS).toBeGreaterThan(0.1);

      // Right should be silent
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);
      expect(rightRMS).toBe(0);
    });

    it('should route ear: "right" only to the right channel', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'right' }]
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, rng);

      // Right should have signal
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);
      expect(rightRMS).toBeGreaterThan(0.1);

      // Left should be silent
      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      expect(leftRMS).toBe(0);
    });

    it('should route ear: "both" to both channels', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, rng);

      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);

      expect(leftRMS).toBeGreaterThan(0.1);
      expect(rightRMS).toBeGreaterThan(0.1);
      expect(leftRMS).toBeCloseTo(rightRMS, 5);
    });
  });

  describe('Noise Isolation', () => {
    it('should route noise ear: "left" only to the left channel', () => {
      const config = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 100,
        envelope: { attackMs: 0, releaseMs: 0 },
        ear: 'left'
      };

      const { left, right } = synthesizeNoise(config, sampleRate, Math.random);

      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);

      expect(leftRMS).toBeGreaterThan(0.1);
      expect(rightRMS).toBe(0);
    });

    it('should route noise ear: "right" only to the right channel', () => {
      const config = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 100,
        envelope: { attackMs: 0, releaseMs: 0 },
        ear: 'right'
      };

      const { left, right } = synthesizeNoise(config, sampleRate, Math.random);

      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);

      expect(rightRMS).toBeGreaterThan(0.1);
      expect(leftRMS).toBe(0);
    });
  });

  describe('Dichotic Perturbations', () => {
    it('should apply gain perturbation only to the targeted ear', () => {
      const config = {
        type: 'multi_component',
        durationMs: 100,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
      };

      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: -20,
        ear: 'left'
      }];

      const { left, right } = synthesizeMultiComponent(config, sampleRate, rng, perturbations);

      const leftRMS = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rightRMS = Math.sqrt(right.reduce((a, b) => a + b * b, 0) / right.length);

      // Left should be 20dB (ratio 0.1) quieter than Right
      expect(leftRMS / rightRMS).toBeCloseTo(0.1, 2);
    });
  });
});
