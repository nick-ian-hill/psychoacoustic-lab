import { describe, it, expect } from 'vitest';
import { generateTrialState } from '../logic/trial.js';
import type { BlockConfig } from '../../../shared/schema.js';

describe('Integration Control - Perturbation Targeting', () => {

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
});
