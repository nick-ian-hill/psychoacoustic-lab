import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { resolvePerturbations } from '../audio/synthesis.js';

/**
 * This test audits the logic used in worker.ts to achieve 
 * Trial-level vs Interval-level roving.
 */
describe('Roving Scoping Logic Audit', () => {
  const seed = 42;
  const adaptiveValue = 0;

  // This is a direct simulation of the worker.ts handler logic
  function simulateWorkerResolution(intervals: any[], seed: number) {
    const trialRng = seedrandom(`${seed}-trial`);
    const trialResolvedMap = new Map<any, any>();
    
    // Step 1: Pre-resolve trial-scoped items (as in worker.ts:49)
    intervals.forEach(interval => {
      interval.perturbations?.forEach((p: any) => {
        if (p.scope === 'trial' && !trialResolvedMap.has(p)) {
          const resolved = resolvePerturbations([p], adaptiveValue, trialRng);
          if (resolved) trialResolvedMap.set(p, resolved[0]);
        }
      });
    });

    // Step 2: Interval resolution loop (as in worker.ts:64)
    return intervals.map((interval, intervalIdx) => {
      const intervalRng = seedrandom(`${seed}-${intervalIdx}`);
      return interval.perturbations?.map((p: any) => {
        if (p.scope === 'trial' && trialResolvedMap.has(p)) {
          return trialResolvedMap.get(p);
        }
        const resolved = resolvePerturbations([p], adaptiveValue, intervalRng);
        return resolved ? resolved[0] : p;
      });
    });
  }

  it('should apply IDENTICAL values across multiple intervals for "scope: trial"', () => {
    const trialSeed = 999;
    
    // A single perturbation object shared across intervals (block-level roving)
    const pTrial = { 
      type: 'gain', 
      deltaDb: { type: 'uniform', min: -10, max: 10 }, 
      scope: 'trial' 
    };

    const intervals = [
      { perturbations: [pTrial] },
      { perturbations: [pTrial] },
      { perturbations: [pTrial] }
    ];

    const results = simulateWorkerResolution(intervals, trialSeed);
    
    const val0 = results[0][0].deltaDb;
    const val1 = results[1][0].deltaDb;
    const val2 = results[2][0].deltaDb;

    // Critical: These are resolved in different loop iterations but must be identical
    expect(val0).toBe(val1);
    expect(val1).toBe(val2);
    expect(typeof val0).toBe('number');
  });

  it('should apply DIFFERENT values across multiple intervals for "scope: interval"', () => {
    const trialSeed = 999;
    
    // A single perturbation object shared across intervals
    const pInterval = { 
      type: 'gain', 
      deltaDb: { type: 'uniform', min: -10, max: 10 }, 
      scope: 'interval' 
    };

    const intervals = [
      { perturbations: [pInterval] },
      { perturbations: [pInterval] },
      { perturbations: [pInterval] }
    ];

    const results = simulateWorkerResolution(intervals, trialSeed);
    
    const val0 = results[0][0].deltaDb;
    const val1 = results[1][0].deltaDb;
    const val2 = results[2][0].deltaDb;

    // Critical: Even though they share the same object, 'interval' scope forces re-resolution
    expect(val0).not.toBe(val1);
    expect(val0).not.toBe(val2);
  });
});
