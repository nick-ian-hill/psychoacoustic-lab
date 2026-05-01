import { describe, it, expect } from 'vitest';
import { StaircaseController } from '../logic/staircase.js';
import type { AdaptiveConfig } from '../../../shared/schema.js';
import seedrandom from 'seedrandom';

describe('Robot Observer - Staircase Convergence Validation', () => {
  // A simple psychometric function: Logistic
  // P(correct) = 1 / (1 + exp(-beta * (x - threshold)))
  // For a 2AFC task, we scale it to [0.5, 1.0]
  const simulateResponse = (value: number, threshold: number, slope: number, rng: () => number) => {
    // In many psychoacoustic tasks (like Tone-in-Noise), HIGHER value = EASIER.
    // So if value > threshold, P(correct) should be high.
    const pCorrect = 0.5 + 0.5 * (1 / (1 + Math.exp(-slope * (value - threshold))));
    return rng() < pCorrect;
  };

  it('should converge to the theoretical 70.7% threshold (2-down 1-up)', () => {
    const rng = seedrandom('robot-observer-staircase-v2');
    
    // Config for a 2-down 1-up staircase
    const config: AdaptiveConfig = {
      type: 'staircase',
      parameter: 'gain',
      initialValue: 30, // Start very high (easy)
      stepType: 'linear',
      stepSizes: [4, 2, 1],
      rule: { correctDown: 2 },
      minValue: -20,
      maxValue: 60,
      unit: 'dB'
    };

    const targetThreshold = 10; // Robot threshold at 10dB
    const slope = 0.8; // Steeper slope for cleaner convergence
    
    const sc = new StaircaseController(config);
    
    // Run 200 trials
    for (let i = 0; i < 200; i++) {
      const currentValue = sc.getCurrentValue();
      const response = simulateResponse(currentValue, targetThreshold, slope, rng);
      sc.processResponse(response);
    }

    const threshold = sc.calculateThreshold(10); // Discard more to ensure stability
    
    expect(threshold).toBeGreaterThan(targetThreshold - 2);
    expect(threshold).toBeLessThan(targetThreshold + 2);
  });
});
