import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { resolvePerturbations } from '../audio/synthesis.js';

/**
 * This audit uses a Robot Observer to verify that "Trial" vs "Interval" scoping 
 * actually reaches the participant in the expected way.
 */
describe('Robot Observer - Roving Scoping Behavioral Audit', () => {
  const adaptiveValue = 0;

  // Simulate the worker's logic for a 2AFC trial
  function simulateTrialResolution(scope: 'trial' | 'interval', signalDb: number, trialSeed: number) {
    const trialRng = seedrandom(`${trialSeed}-trial`);
    const interval0Rng = seedrandom(`${trialSeed}-0`);
    const interval1Rng = seedrandom(`${trialSeed}-1`);

    const pRoving = { 
      type: 'gain', 
      deltaDb: { type: 'uniform', min: -10, max: 10 }, 
      scope: scope 
    } as any;

    const pTarget = {
      type: 'gain',
      deltaDb: signalDb,
      applyTo: 'target'
    } as any;

    // Resolve Roving (Trial scoped is resolved once)
    let roving0, roving1;
    if (scope === 'trial') {
      const res = resolvePerturbations([pRoving], adaptiveValue, trialRng)![0] as any;
      roving0 = res.deltaDb;
      roving1 = res.deltaDb;
    } else {
      roving0 = (resolvePerturbations([pRoving], adaptiveValue, interval0Rng)![0] as any).deltaDb;
      roving1 = (resolvePerturbations([pRoving], adaptiveValue, interval1Rng)![0] as any).deltaDb;
    }

    // Resolve Target (always target interval, which we'll say is interval 1)
    const targetAdd = pTarget.deltaDb;

    const level0 = 70 + roving0;
    const level1 = 70 + roving1 + targetAdd;

    return level1 > level0;
  }

  it('should result in 100% accuracy for TRIAL scoping (Consistent Pedestal)', () => {
    let correctCount = 0;
    const numTrials = 100;
    const signalDb = 1; // Small 1dB signal
    
    for (let i = 0; i < numTrials; i++) {
      if (simulateTrialResolution('trial', signalDb, i)) correctCount++;
    }

    // With Trial scoping, the +/- 10dB roving is IDENTICAL for both intervals.
    // So the robot ALWAYS hears the 1dB signal difference perfectly.
    expect(correctCount).toBe(numTrials);
  });

  it('should result in low accuracy for INTERVAL scoping (Independent Jitter)', () => {
    let correctCount = 0;
    const numTrials = 100;
    const signalDb = 1; // Same small 1dB signal
    
    for (let i = 0; i < numTrials; i++) {
      if (simulateTrialResolution('interval', signalDb, i)) correctCount++;
    }

    // With Interval scoping, the jitter is +/- 10dB (20dB range).
    // A 1dB signal is very likely to be "flipped" by a louder random reference.
    // Statistically, accuracy should be poor (near chance or slightly above).
    expect(correctCount).toBeLessThan(numTrials * 0.7); 
  });
});
