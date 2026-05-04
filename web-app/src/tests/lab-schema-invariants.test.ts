import { describe, it, expect } from 'vitest';
import { BlockSchema } from '../../../shared/schema.js';

describe('Schema Invariants - BlockSchema Semantic Validation', () => {
  const baseBlock = {
    id: 'test-block',
    paradigm: {
      type: '2AFC',
      intervals: [{ condition: 'reference' }, { condition: 'target' }],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [{
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 10, releaseMs: 10 },
      components: [{ frequency: 1000, levelDb: 60 }]
    }],
    meta: { summary: 'Test' }
  };

  it('should pass for a valid static configuration', () => {
    const validConfig = {
      ...baseBlock,
      perturbations: [{ type: 'gain', deltaDb: 6 }]
    };
    const result = BlockSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should pass for a valid adaptive configuration', () => {
    const validAdaptive = {
      ...baseBlock,
      perturbations: [{ type: 'gain', deltaDb: { adaptive: true } }],
      adaptive: {
        type: 'staircase',
        parameter: 'gain',
        initialValue: 30,
        stepSizes: [4, 2, 1],
        rule: { correctDown: 2 },
        minValue: 0,
        maxValue: 60
      }
    };
    const result = BlockSchema.safeParse(validAdaptive);
    expect(result.success).toBe(true);
  });

  it('should fail if adaptive perturbation is present but no adaptive block is defined', () => {
    const invalidConfig = {
      ...baseBlock,
      perturbations: [{ type: 'gain', deltaDb: { adaptive: true } }]
      // Missing 'adaptive' block
    };
    const result = BlockSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("no 'adaptive' block is defined");
    }
  });

  it('should fail if adaptive block is defined but no perturbation uses it', () => {
    const invalidConfig = {
      ...baseBlock,
      perturbations: [{ type: 'gain', deltaDb: 6 }], // Static
      adaptive: {
        type: 'staircase',
        parameter: 'gain',
        initialValue: 30,
        stepSizes: [4, 2, 1],
        rule: { correctDown: 2 },
        minValue: 0,
        maxValue: 60
      }
    };
    const result = BlockSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("no perturbation is hooked up to it");
    }
  });

  it('should accept RandomChoiceSchema as a perturbation parameter', () => {
    const validChoice = {
      ...baseBlock,
      perturbations: [{ 
        type: 'gain', 
        deltaDb: { type: 'choice', values: [-5, 0, 5] } 
      }]
    };
    const result = BlockSchema.safeParse(validChoice);
    expect(result.success).toBe(true);
  });

  it('should validate that targetPerturbation can also be adaptive', () => {
    const validAdaptiveTarget = {
      ...baseBlock,
      paradigm: {
        ...baseBlock.paradigm,
        targetPerturbation: { type: 'gain', deltaDb: { adaptive: true } }
      },
      adaptive: {
        type: 'staircase',
        parameter: 'gain',
        initialValue: 30,
        stepSizes: [4, 2, 1],
        rule: { correctDown: 2 },
        minValue: 0,
        maxValue: 60
      }
    };
    
    const result = BlockSchema.safeParse(validAdaptiveTarget);
    expect(result.success).toBe(true);
  });

  it('should fail if targetPerturbation is adaptive but no adaptive block is defined', () => {
    const invalidConfig = {
      ...baseBlock,
      paradigm: {
        ...baseBlock.paradigm,
        targetPerturbation: { type: 'gain', deltaDb: { adaptive: true } }
      }
      // Missing 'adaptive' block
    };
    const result = BlockSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("no 'adaptive' block is defined");
    }
  });
});
