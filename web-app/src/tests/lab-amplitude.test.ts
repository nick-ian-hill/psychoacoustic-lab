import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, getCalibrationOffset } from '../audio/synthesis.js';

describe('Amplitude Validation - RMS, Roving, Calibration', () => {
  const sampleRate = 44100;
  const rng = () => 0.5;

  it('should apply calibration offsets correctly (Log Interpolation)', () => {
    const calibration = {
      TransducerName: "Test",
      points: [
        { frequency: 1000, offsetDb: 0 },
        { frequency: 10000, offsetDb: 20 }
      ]
    };

    // At 1000Hz, offset should be 0
    expect(getCalibrationOffset(1000, calibration)).toBe(0);
    // At 10000Hz, offset should be 20
    expect(getCalibrationOffset(10000, calibration)).toBe(20);
    // At 3162Hz (geometric mid-point), offset should be 10
    expect(getCalibrationOffset(Math.sqrt(1000 * 10000), calibration)).toBeCloseTo(10, 1);
  });

  it('should generate requested RMS level for pure tones', () => {
    const levelDb = -6; // 0.5 amplitude
    const config = {
      type: 'multi_component',
      durationMs: 1000,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 1000, levelDb: levelDb, ear: 'both' }]
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, rng);
    
    // RMS of a sine wave with amplitude A is A/sqrt(2)
    // Here A = 10^(levelDb/20)
    const A = Math.pow(10, levelDb / 20);
    const expectedRMS = A / Math.sqrt(2);
    
    let sumSq = 0;
    for (let i = 0; i < left.length; i++) {
      sumSq += left[i] * left[i];
    }
    const actualRMS = Math.sqrt(sumSq / left.length);
    
    expect(actualRMS).toBeCloseTo(expectedRMS, 3);
  });

  it('should apply uniform roving correctly', () => {
    const min = -10;
    const max = 10;
    const perturbations = [{
      type: 'gain' as const,
      deltaDb: { type: 'uniform' as const, min, max }
    }];

    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 1000, levelDb: 0, ear: 'both' }]
    };

    // With rng = 0.5, roving should be (min+max)/2 = 0
    const { left: leftMid } = synthesizeMultiComponent(config, sampleRate, () => 0.5, perturbations);
    const rmsMid = Math.sqrt(leftMid.reduce((a,b) => a + b*b, 0) / leftMid.length);
    
    // With rng = 0, roving should be -10dB
    const { left: leftLow } = synthesizeMultiComponent(config, sampleRate, () => 0, perturbations);
    const rmsLow = Math.sqrt(leftLow.reduce((a,b) => a + b*b, 0) / leftLow.length);

    const ratio = rmsLow / rmsMid;
    expect(20 * Math.log10(ratio)).toBeCloseTo(-10, 1);
  });
});
