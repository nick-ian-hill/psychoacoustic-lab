import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

describe('Roving Distribution - Statistical Uniformity', () => {
  const sampleRate = 44100;

  it('should produce a uniform distribution of RMS levels across 1000 realizations', () => {
    const min = -10;
    const max = 10;
    const perturbations: any[] = [{
      type: 'gain',
      deltaDb: { type: 'uniform', min, max }
    }];

    const config = {
      type: 'multi_component',
      durationMs: 10, // Short duration is fine
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
    };

    const rmsValuesDb: number[] = [];
    const numRealizations = 1000;

    for (let i = 0; i < numRealizations; i++) {
      // Use a new RNG per realization
      const { left } = synthesizeMultiComponent(config, sampleRate, Math.random, perturbations);
      const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
      const rmsDb = 20 * Math.log10(rms * Math.sqrt(2)); // Normalize so 0dB = 1.0 peak
      rmsValuesDb.push(rmsDb);
    }

    // Check if the distribution is approximately uniform
    // We'll bin the results into 5 bins
    const numBins = 5;
    const binCounts = new Array(numBins).fill(0);
    const binSize = (max - min) / numBins;

    rmsValuesDb.forEach(val => {
      const binIdx = Math.floor((val - min) / binSize);
      if (binIdx >= 0 && binIdx < numBins) {
        binCounts[binIdx]++;
      }
    });

    // Each bin should have approx 200 counts (1000 / 5)
    // We allow a +/- 25% margin for random variance
    const expectedPerBin = numRealizations / numBins;
    binCounts.forEach(count => {
      expect(count).toBeGreaterThan(expectedPerBin * 0.75);
      expect(count).toBeLessThan(expectedPerBin * 1.25);
    });
  });
});
