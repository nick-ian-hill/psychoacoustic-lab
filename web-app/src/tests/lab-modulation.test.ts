import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Modulation Validation - AM, FM, Correlation', () => {
  const sampleRate = 44100;
  const rng = () => Math.random();

  describe('Amplitude Modulation (AM)', () => {
    it('should apply correct AM depth to a pure tone', () => {
      const depth = 0.5;
      const rateHz = 10;
      const config = {
        type: 'multi_component',
        durationMs: 500,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{
          frequency: 1000,
          levelDb: 0,
          modulators: [{ type: 'AM' as const, depth, rateHz, phaseDegrees: 0 }]
        }]
      };

      const { left } = synthesizeMultiComponent(config, sampleRate, rng);
      
      // Find the peak near 25ms (first AM peak)
      const center = Math.floor(0.025 * sampleRate);
      const window = 100; // Look at a few cycles of the 1000Hz carrier
      let maxAmp = 0;
      for (let i = center - window; i < center + window; i++) {
        maxAmp = Math.max(maxAmp, Math.abs(left[i]));
      }

      // With depth 0.5, peak carrier amplitude should be 1.0 * (1 + 0.5) = 1.5
      expect(maxAmp).toBeCloseTo(1.5, 0.05);

      // Find the trough near 75ms (first AM trough)
      const tCenter = Math.floor(0.075 * sampleRate);
      let minPeak = 0;
      for (let i = tCenter - window; i < tCenter + window; i++) {
        minPeak = Math.max(minPeak, Math.abs(left[i]));
      }
      
      // With depth 0.5, trough carrier amplitude should be 1.0 * (1 - 0.5) = 0.5
      expect(minPeak).toBeCloseTo(0.5, 0.05);
    });

    it('should apply AM starting phase correctly (Peak vs Trough)', () => {
      const durationMs = 500;
      const rateHz = 4;
      const depth = 1.0; 
      const fixedRng = () => 0.5;

      const peakConfig = {
        type: 'noise' as const,
        noiseType: 'white' as const,
        levelDb: 60,
        durationMs,
        envelope: { attackMs: 0, releaseMs: 0 },
        modulators: [{ type: 'AM' as const, depth, rateHz, phaseDegrees: 90 }]
      };

      const troughConfig = {
        type: 'noise' as const,
        noiseType: 'white' as const,
        levelDb: 60,
        durationMs,
        envelope: { attackMs: 0, releaseMs: 0 },
        modulators: [{ type: 'AM' as const, depth, rateHz, phaseDegrees: -90 }]
      };

      const peakRes = synthesizeNoise(peakConfig, sampleRate, fixedRng);
      const troughRes = synthesizeNoise(troughConfig, sampleRate, fixedRng);

      const sampleIdx = 10; 
      expect(Math.abs(peakRes.left[sampleIdx])).toBeGreaterThan(Math.abs(troughRes.left[sampleIdx]) * 10);
      expect(Math.abs(troughRes.left[sampleIdx])).toBeLessThan(0.01);
    });
  });

  describe('Frequency Modulation (FM)', () => {
    it('should swing the instantaneous frequency correctly', () => {
      const carrierFreq = 1000;
      const depthHz = 500; // Swing between 500Hz and 1500Hz
      const rateHz = 2;    // Slow swing so we can measure distinct periods
      const config = {
        type: 'multi_component' as const,
        durationMs: 500,
        globalEnvelope: { attackMs: 0, releaseMs: 0 },
        components: [{
          frequency: carrierFreq,
          levelDb: 0,
          modulators: [{ type: 'FM' as const, depth: depthHz, rateHz, phaseDegrees: 0 }]
        }]
      };

      const { left } = synthesizeMultiComponent(config, sampleRate, rng);

      // Helper to find the next zero-crossing to measure local period
      const getPeriodAt = (startIndex: number) => {
        let i = startIndex;
        while (i < left.length - 1 && !(left[i] <= 0 && left[i+1] > 0)) i++;
        const firstCross = i;
        i++;
        while (i < left.length - 1 && !(left[i] <= 0 && left[i+1] > 0)) i++;
        return i - firstCross;
      };

      // Peak FM (t = 125ms for 2Hz rate): Freq should be 1500Hz
      // Period should be approx 44100 / 1500 = 29.4 samples
      const peakIndex = Math.floor(0.125 * sampleRate);
      const peakPeriod = getPeriodAt(peakIndex);
      expect(peakPeriod).toBeLessThan(35);
      expect(peakPeriod).toBeGreaterThan(25);

      // Trough FM (t = 375ms): Freq should be 500Hz
      // Period should be approx 44100 / 500 = 88.2 samples
      const troughIndex = Math.floor(0.375 * sampleRate);
      const troughPeriod = getPeriodAt(troughIndex);
      expect(troughPeriod).toBeGreaterThan(80);
      expect(troughPeriod).toBeLessThan(95);
    });
  });

  describe('Shared Envelopes (Correlation)', () => {
    it('should perfectly correlate two noise bands with the same sharedEnvelopeId', () => {
      const sharedEnvelopes = new Map<string, Float32Array>();
      const envLen = 1000;
      const envSamples = new Float32Array(envLen);
      for(let i=0; i<envLen; i++) envSamples[i] = Math.sin(2 * Math.PI * 10 * i / envLen);
      sharedEnvelopes.set('mod1', envSamples);

      const noiseConfig = {
        type: 'noise',
        noiseType: 'white',
        levelDb: 0,
        durationMs: 100,
        envelope: { attackMs: 0, releaseMs: 0 },
        modulators: [{ type: 'AM' as const, depth: 1.0, sharedEnvelopeId: 'mod1' }]
      };

      // Generate two different noise realizations but with same modulator
      const res1 = synthesizeNoise(noiseConfig, sampleRate, () => Math.random(), [], 0, undefined, sharedEnvelopes);
      const res2 = synthesizeNoise(noiseConfig, sampleRate, () => Math.random(), [], 0, undefined, sharedEnvelopes);

      // Extract envelopes with smoothing
      const extractEnv = (samples: Float32Array) => {
        const rectified = new Float32Array(samples.length);
        for(let i=0; i<samples.length; i++) rectified[i] = Math.abs(samples[i]);
        
        // Simple moving average (window size approx 1ms)
        const smoothed = new Float32Array(samples.length);
        const win = 44; 
        for(let i=win; i<samples.length-win; i++) {
          let sum = 0;
          for(let j=-win; j<=win; j++) sum += rectified[i+j];
          smoothed[i] = sum / (2*win + 1);
        }
        return smoothed;
      };

      const env1 = extractEnv(res1.left);
      const env2 = extractEnv(res2.left);

      // Correlation of envelopes should be very high (approaching 1.0)
      // while correlation of raw samples should be very low (near 0.0)
      const correlate = (a: Float32Array, b: Float32Array) => {
        let sumAB = 0, sumA2 = 0, sumB2 = 0;
        for(let i=0; i<a.length; i++) {
          sumAB += a[i] * b[i];
          sumA2 += a[i] * a[i];
          sumB2 += b[i] * b[i];
        }
        return sumAB / (Math.sqrt(sumA2) * Math.sqrt(sumB2));
      };

      const rawCorr = correlate(res1.left, res2.left);
      const envCorr = correlate(env1, env2);

      expect(Math.abs(rawCorr)).toBeLessThan(0.1);
      expect(envCorr).toBeGreaterThan(0.8); // High correlation due to shared AM
    });
  });
});
