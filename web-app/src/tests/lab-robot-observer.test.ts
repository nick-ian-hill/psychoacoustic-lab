import { describe, it, expect } from 'vitest';
import { StaircaseController } from '../logic/staircase.js';
import type { AdaptiveConfig } from '../../../shared/schema.js';
import seedrandom from 'seedrandom';

describe('Robot Observer - Staircase Convergence Validation', () => {
  it('should converge to the theoretical 70.7% threshold (2-down 1-up)', () => {
    const rng = seedrandom('robot-observer-linear');
    
    const config: AdaptiveConfig = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 30,
      stepType: 'linear',
      stepSizes: [4, 2, 1],
      rule: { correctDown: 2 },
      minValue: -20,
      maxValue: 60,
      unit: 'dB'
    };

    const targetThreshold = 10;
    const slope = 0.8;
    const sc = new StaircaseController(config);
    
    for (let i = 0; i < 300; i++) {
      const currentValue = sc.getCurrentValue();
      const pCorrect = 0.5 + 0.5 * (1 / (1 + Math.exp(-slope * (currentValue - targetThreshold))));
      sc.processResponse(rng() < pCorrect);
    }

    const threshold = sc.calculateThreshold(10);
    expect(threshold).toBeGreaterThan(targetThreshold - 2);
    expect(threshold).toBeLessThan(targetThreshold + 2);
  });

  it('should converge correctly on a geometric scale', () => {
    const rng = seedrandom('robot-observer-geometric');
    
    const config: AdaptiveConfig = {
      type: 'staircase',
      parameter: 'delta',
      initialValue: 1.0,
      stepType: 'geometric',
      stepSizes: [2, 1.414, 1.189],
      rule: { correctDown: 2 },
      minValue: 0.001,
      maxValue: 10,
      unit: '%'
    };

    const targetThreshold = 0.1; // 10% threshold
    const slope = 4.0; // Higher slope for log-space
    const sc = new StaircaseController(config);
    
    for (let i = 0; i < 400; i++) {
      const currentValue = sc.getCurrentValue();
      // In geometric tasks, we usually track 'threshold' where value > threshold is easy
      const logDistance = Math.log(currentValue) - Math.log(targetThreshold);
      const pCorrect = 0.5 + 0.5 * (1 / (1 + Math.exp(-slope * logDistance)));
      sc.processResponse(rng() < pCorrect);
    }

    const threshold = sc.calculateThreshold(10);
    // 0.1 +/- a bit
    expect(threshold).toBeGreaterThan(0.08);
    expect(threshold).toBeLessThan(0.12);
  });

  it('should converge to the theoretical 79.4% threshold (3-down 1-up)', () => {
    const rng = seedrandom('robot-observer-3down');
    
    const config: AdaptiveConfig = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 30,
      stepType: 'linear',
      stepSizes: [4, 2, 1],
      rule: { correctDown: 3 },
      minValue: -20,
      maxValue: 60,
      unit: 'dB'
    };

    const targetThreshold = 10; // This is the 75% point of our logistic function
    const slope = 0.8;
    const sc = new StaircaseController(config);
    
    for (let i = 0; i < 500; i++) {
      const currentValue = sc.getCurrentValue();
      const pCorrect = 0.5 + 0.5 * (1 / (1 + Math.exp(-slope * (currentValue - targetThreshold))));
      sc.processResponse(rng() < pCorrect);
    }

    const threshold = sc.calculateThreshold(10);
    // 3-down tracks 79.4%, which is higher than our 75% point (10dB).
    // So it should converge at > 10dB.
    expect(threshold).toBeGreaterThan(10);
    expect(threshold).toBeLessThan(15);
  });
});
