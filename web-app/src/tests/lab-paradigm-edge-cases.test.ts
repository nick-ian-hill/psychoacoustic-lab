import { describe, it, expect } from 'vitest';
import { generateTrialState } from '../logic/trial.js';
import { StaircaseController } from '../logic/staircase.js';

describe('Paradigm Edge Cases - Fixed Intervals & Termination', () => {
  
  describe('Fixed Intervals (generateTrialState)', () => {
    it('should NEVER pick a fixed: true reference interval as the target', () => {
      const block: any = {
        paradigm: {
          type: '3AFC',
          randomizeOrder: true,
          intervals: [
            { condition: 'reference', fixed: true, selectable: true }, // Fixed Ref
            { condition: 'target', selectable: true },
            { condition: 'target', selectable: true }
          ]
        }
      };

      // Run many times, targetIndex should only be 1 or 2, never 0.
      for (let i = 0; i < 100; i++) {
        const { targetIndex } = generateTrialState(block, Math.random);
        expect(targetIndex).not.toBe(0);
        expect([1, 2]).toContain(targetIndex);
      }
    });

    it('should ALWAYS pick a fixed: true target interval if present', () => {
      const block: any = {
        paradigm: {
          type: '2AFC',
          randomizeOrder: true, // Should be ignored because target is fixed
          intervals: [
            { condition: 'target', fixed: true, selectable: true },
            { condition: 'reference', selectable: true }
          ]
        }
      };

      for (let i = 0; i < 50; i++) {
        const { targetIndex } = generateTrialState(block, Math.random);
        expect(targetIndex).toBe(0);
      }
    });
  });

  describe('Termination Logic (StaircaseController)', () => {
    it('should terminate after correctTrials count is reached', () => {
      const config: any = {
        initialValue: 10,
        rule: { correctDown: 2 },
        stepSizes: [1]
      };
      const sc = new StaircaseController(config);
      
      const termination = { correctTrials: 5 };
      
      // 4 correct, 1 incorrect, 1 correct = 5 correct total
      sc.processResponse(true);
      sc.processResponse(true);
      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.isFinished(termination)).toBe(false);
      
      sc.processResponse(false);
      expect(sc.isFinished(termination)).toBe(false);
      
      sc.processResponse(true); // 5th correct
      expect(sc.isFinished(termination)).toBe(true);
    });

    it('should respect multiple termination conditions (trials OR correctTrials)', () => {
      const config: any = {
        initialValue: 10,
        rule: { correctDown: 2 },
        stepSizes: [1]
      };
      const sc = new StaircaseController(config);
      const termination = { trials: 10, correctTrials: 3 };

      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.isFinished(termination)).toBe(false);
      
      sc.processResponse(true); // 3rd correct -> Finish
      expect(sc.isFinished(termination)).toBe(true);
    });
  });
});
