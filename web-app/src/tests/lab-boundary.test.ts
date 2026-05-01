import { describe, it, expect, beforeEach } from 'vitest';
import { StaircaseController } from '../logic/staircase.js';
import type { AdaptiveConfig } from '../../../shared/schema.js';

describe('Scientific Guard - Adaptive Boundaries', () => {
  let config: AdaptiveConfig;

  beforeEach(() => {
    config = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 0,
      minValue: -10,
      maxValue: 10,
      stepSizes: [2],
      rule: { correctDown: 1 }, // 1-down for fast boundary testing
      unit: 'dB'
    };
  });

  it('should never exceed the hard maxValue', () => {
    const controller = new StaircaseController(config);
    
    // Attempt to move UP past 10 (by responding incorrectly)
    for (let i = 0; i < 20; i++) {
        controller.processResponse(false); // Incorrect -> Increase value
    }
    
    expect(controller.getCurrentValue()).toBeLessThanOrEqual(10);
    expect(controller.getCurrentValue()).toBe(10);
  });

  it('should never drop below the hard minValue', () => {
    const controller = new StaircaseController(config);
    
    // Attempt to move DOWN past -10
    for (let i = 0; i < 20; i++) {
        controller.processResponse(true); // Correct -> Decrease value
    }
    
    expect(controller.getCurrentValue()).toBeGreaterThanOrEqual(-10);
    expect(controller.getCurrentValue()).toBe(-10);
  });
});
