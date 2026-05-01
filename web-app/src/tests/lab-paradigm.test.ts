import { describe, it, expect } from 'vitest';
import { generateTrialState } from '../logic/trial.js';
import type { BlockConfig } from '../../../shared/schema.js';

describe('Paradigm Validation - Randomization & Selectivity', () => {
  const mockBlock: any = {
    paradigm: {
      type: 'm-AFC',
      intervals: [
        { condition: 'reference', selectable: true },
        { condition: 'target', selectable: true }
      ],
      randomizeOrder: true,
      timing: { isiMs: 0, itiMs: 0 }
    }
  };

  it('should randomize target position across selectable intervals', () => {
    const iterations = 1000;
    let pos0 = 0;
    let pos1 = 0;

    for (let i = 0; i < iterations; i++) {
      const state = generateTrialState(mockBlock as BlockConfig, Math.random);
      if (state.targetIndex === 0) pos0++;
      else if (state.targetIndex === 1) pos1++;
    }

    // Should be approx 50/50
    expect(pos0 / iterations).toBeCloseTo(0.5, 0.1);
    expect(pos1 / iterations).toBeCloseTo(0.5, 0.1);
  });

  it('should NEVER select an interval marked selectable: false', () => {
    const anchoredBlock: any = {
      paradigm: {
        type: 'm-AFC',
        intervals: [
          { condition: 'reference', selectable: false }, // Anchor
          { condition: 'reference', selectable: true },
          { condition: 'target', selectable: true },
          { condition: 'reference', selectable: false }  // Anchor
        ],
        randomizeOrder: true,
        timing: { isiMs: 0, itiMs: 0 }
      }
    };

    for (let i = 0; i < 100; i++) {
      const state = generateTrialState(anchoredBlock as BlockConfig, Math.random);
      expect(state.targetIndex).not.toBe(0);
      expect(state.targetIndex).not.toBe(3);
      expect([1, 2]).toContain(state.targetIndex);
    }
  });

  it('should respect randomizeOrder: false', () => {
    const fixedBlock: any = {
      paradigm: {
        type: 'm-AFC',
        intervals: [
          { condition: 'reference', selectable: true },
          { condition: 'target', selectable: true }
        ],
        randomizeOrder: false,
        timing: { isiMs: 0, itiMs: 0 }
      }
    };

    for (let i = 0; i < 10; i++) {
      const state = generateTrialState(fixedBlock as BlockConfig, Math.random);
      expect(state.targetIndex).toBe(0);
    }
  });
});
