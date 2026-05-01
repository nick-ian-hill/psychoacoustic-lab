import { describe, it, expect } from 'vitest';
import { generateTrialState } from '../logic/trial.js';
import { synthesizeMultiComponent } from '../audio/synthesis.js';
import type { BlockConfig } from '../../../shared/schema.js';

describe('Integration Control - Perturbation Targeting & Adaptive Resolution', () => {
  const sampleRate = 44100;

  describe('generateTrialState - Perturbation Mapping', () => {
    it('should correctly apply targetPerturbation only to the target interval', () => {
      const block: any = {
        paradigm: {
          type: '2AFC',
          intervals: [
            { condition: 'reference', selectable: true },
            { condition: 'reference', selectable: true }
          ],
          targetPerturbation: { type: 'gain', deltaDb: 6 },
          randomizeOrder: true,
          timing: { isiMs: 500, itiMs: 1000 }
        }
      };

      // Mock RNG to always pick index 1
      const state = generateTrialState(block as BlockConfig, () => 0.9);
      expect(state.targetIndex).toBe(1);
      expect(state.intervalPerturbations[0]).toHaveLength(0);
      expect(state.intervalPerturbations[1]).toHaveLength(1);
      expect(state.intervalPerturbations[1][0].deltaDb).toBe(6);
    });

    it('should include interval-specific perturbations regardless of target status', () => {
      const block: any = {
        paradigm: {
          type: '2AFC',
          intervals: [
            { condition: 'reference', selectable: true, perturbations: [{ type: 'gain', deltaDb: -10 }] },
            { condition: 'reference', selectable: true }
          ],
          targetPerturbation: { type: 'gain', deltaDb: 6 },
          randomizeOrder: true,
          timing: { isiMs: 500, itiMs: 1000 }
        }
      };

      // Target is index 1
      const state = generateTrialState(block as BlockConfig, () => 0.9);
      expect(state.intervalPerturbations[0]).toHaveLength(1);
      expect(state.intervalPerturbations[0][0].deltaDb).toBe(-10);
      expect(state.intervalPerturbations[1]).toHaveLength(1);
      expect(state.intervalPerturbations[1][0].deltaDb).toBe(6);
    });
  });

  describe('Adaptive Resolution in Synthesis', () => {
    it('should resolve { adaptive: true } using the provided adaptiveValue', () => {
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
      };
      
      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: { adaptive: true }
      }];

      const adaptiveValue = -12;
      const { left } = synthesizeMultiComponent(config, sampleRate, Math.random, perturbations, adaptiveValue);
      
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRMS = Math.pow(10, -12 / 20) / Math.sqrt(2);
      
      expect(rms).toBeCloseTo(expectedRMS, 3);
    });

    it('should resolve Random Uniform perturbations', () => {
      const config = {
        type: 'multi_component',
        durationMs: 10,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
      };
      
      const perturbations: any[] = [{
        type: 'gain',
        deltaDb: { type: 'uniform', min: -20, max: -20 } // Effectively fixed at -20
      }];

      const { left } = synthesizeMultiComponent(config, sampleRate, () => 0.5, perturbations);
      
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const expectedRMS = Math.pow(10, -20 / 20) / Math.sqrt(2);
      
      expect(rms).toBeCloseTo(expectedRMS, 3);
    });
  });
});
