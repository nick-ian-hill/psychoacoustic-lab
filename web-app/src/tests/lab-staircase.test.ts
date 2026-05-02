import { describe, it, expect, beforeEach } from 'vitest';
import { StaircaseController } from '../logic/staircase.js';
import type { AdaptiveConfig } from '../../../shared/schema.js';

describe('StaircaseController - Scientific Validation', () => {
  let linearConfig: AdaptiveConfig;
  let geometricConfig: AdaptiveConfig;

  beforeEach(() => {
    linearConfig = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 10,
      stepType: 'linear',
      stepSizes: [2, 1],
      rule: { correctDown: 2 },
      initialN: 2,
      minValue: 0,
      maxValue: 20,
      unit: 'dB'
    };

    geometricConfig = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 10,
      stepType: 'geometric',
      stepSizes: [2, 1.414],
      rule: { correctDown: 2 },
      initialN: 2,
      minValue: 0.1,
      maxValue: 100,
      unit: '%'
    };
  });

  describe('Stepping Logic', () => {
    it('should follow 2-down 1-up linear rule', () => {
      const sc = new StaircaseController(linearConfig);
      
      // 1. Initial value
      expect(sc.getCurrentValue()).toBe(10);

      // 2. One correct: no change
      sc.processResponse(true);
      expect(sc.getCurrentValue()).toBe(10);

      // 3. Two correct: step down by 2 (first step size)
      sc.processResponse(true);
      expect(sc.getCurrentValue()).toBe(8);

      // 4. One incorrect: step up by 2
      sc.processResponse(false);
      expect(sc.getCurrentValue()).toBe(10);
    });

    it('should follow 2-down 1-up geometric rule', () => {
      const sc = new StaircaseController(geometricConfig);
      
      expect(sc.getCurrentValue()).toBe(10);

      // Two correct: divide by 2
      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.getCurrentValue()).toBe(5);

      // One incorrect: multiply by 2
      sc.processResponse(false);
      expect(sc.getCurrentValue()).toBe(10);
    });
  });

  describe('Reversals and Step Size Reduction', () => {
    it('should advance step size on reversal', () => {
      const sc = new StaircaseController(linearConfig);
      
      // First reversal: Down -> Up
      sc.processResponse(true);
      sc.processResponse(true); // Value: 8
      sc.processResponse(false); // Reversal! Value: 10. Step size becomes 1.
      
      expect(sc.getReversalCount()).toBe(1);
      
      // Next step down should be by 1
      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.getCurrentValue()).toBe(9);
    });

    it('should respect stepSizeInterval', () => {
      const intervalConfig = { ...linearConfig, stepSizeInterval: 2 };
      const sc = new StaircaseController(intervalConfig);

      // Reversal 1
      sc.processResponse(true);
      sc.processResponse(true);
      sc.processResponse(false); 
      expect(sc.getReversalCount()).toBe(1);

      // Should still use stepSize[0] (2)
      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.getCurrentValue()).toBe(8); // 10 - 2 = 8 (stays on first step size)
    });
  });

  describe('Termination Rules', () => {
    it('should stop after N reversals', () => {
      const sc = new StaircaseController(linearConfig);
      const term = { reversals: 2 };

      expect(sc.isFinished(term)).toBe(false);

      // Reversal 1
      sc.processResponse(true); sc.processResponse(true);
      sc.processResponse(false);
      expect(sc.isFinished(term)).toBe(false);

      // Reversal 2
      sc.processResponse(true); sc.processResponse(true);
      sc.processResponse(false);
      expect(sc.isFinished(term)).toBe(true);
    });

    it('should stop after M trials', () => {
      const sc = new StaircaseController(linearConfig);
      const term = { trials: 3 };

      sc.processResponse(true);
      sc.processResponse(true);
      expect(sc.isFinished(term)).toBe(false);
      sc.processResponse(true);
      expect(sc.isFinished(term)).toBe(true);
    });
  });

  describe('Threshold Calculation', () => {
    it('should calculate arithmetic mean of reversal points (Linear)', () => {
      const sc = new StaircaseController(linearConfig);
      
      // Rev 1 at 10
      sc.processResponse(true); sc.processResponse(true); // 8
      sc.processResponse(false); // 10 (Rev 1)
      
      // Rev 2 at 8
      sc.processResponse(true); sc.processResponse(true); // 9
      sc.processResponse(true); sc.processResponse(true); // 8
      sc.processResponse(false); // 9 (Rev 2)

      // Rev 3 at 7
      sc.processResponse(true); sc.processResponse(true); // 8
      sc.processResponse(true); sc.processResponse(true); // 7
      sc.processResponse(false); // 8 (Rev 3)

      // Calculate threshold with discardCount=0
      // Reversal values are the values *at the time of reversal*
      // Rev 1 happened after response at 8, so value was 8? 
      // Let's check history: {value: 8, correct: false, isReversal: true}
      const history = sc.getHistory();
      const reversalValues = history.filter(h => h.isReversal).map(h => h.value);
      
      const expectedMean = reversalValues.reduce((a,b) => a+b, 0) / reversalValues.length;
      expect(sc.calculateThreshold(0)).toBeCloseTo(expectedMean);
    });

    it('is calculated correctly for geometric means', () => {
      const sc = new StaircaseController(geometricConfig);
      
      // Setup a manual history of reversals
      // Log mean of 10 and 5 should be sqrt(50) = 7.071
      (sc as any).history = [
        { value: 10, isReversal: true, correct: false },
        { value: 5, isReversal: true, correct: true }
      ];

      const threshold = sc.calculateThreshold(0);
      expect(threshold).toBeCloseTo(Math.sqrt(50), 4);
    });
  });
});
