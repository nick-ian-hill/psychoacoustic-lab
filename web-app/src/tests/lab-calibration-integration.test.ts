import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent, synthesizeNoise } from '../audio/synthesis.js';

describe('Calibration Integration - End-to-End Validation', () => {
  const sampleRate = 44100;
  const rng = () => 0.5;

  it('Multi-Component: should apply frequency-specific calibration offsets to absolute levels', () => {
    const calibration = {
      id: "test-cal",
      points: [
        { frequency: 1000, offsetDb: 10 },
        { frequency: 2000, offsetDb: -10 }
      ]
    };

    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [
        { frequency: 1000, levelDb: 0 },
        { frequency: 2000, levelDb: 0 }
      ]
    };

    // 1. RAW Synthesis (No calibration)
    // Both 1k and 2k at 0dB (amp 1.0). 
    // Combined RMS = sqrt(0.707^2 + 0.707^2) = 1.0
    const { left: raw } = synthesizeMultiComponent(config, sampleRate, rng);
    const rmsRaw = Math.sqrt(raw.reduce((a, b) => a + b * b, 0) / raw.length);
    expect(rmsRaw).toBeCloseTo(1.0, 2);

    // 2. Calibrated Synthesis
    // 1k @ +10dB (amp 3.16) -> RMS 2.23
    // 2k @ -10dB (amp 0.316) -> RMS 0.223
    // Total RMS = sqrt(2.23^2 + 0.223^2) = sqrt(4.97 + 0.049) = sqrt(5.02) approx 2.24
    const { left: cal } = synthesizeMultiComponent(config, sampleRate, rng, undefined, undefined, calibration);
    const rmsCal = Math.sqrt(cal.reduce((a, b) => a + b * b, 0) / cal.length);
    
    expect(rmsCal).toBeCloseTo(2.247, 2);
  });

  it('Noise: should apply calibration to spectral shape (Sloped Calibration)', () => {
    // We test if a sloped calibration changes the spectral energy balance
    const calibration = {
      id: "tilt-cal",
      points: [
        { frequency: 100, offsetDb: 0 },
        { frequency: 10000, offsetDb: 40 } // Strong high-frequency boost
      ]
    };

    const config = {
      type: 'noise',
      noiseType: 'white' as const,
      levelDb: 0,
      durationMs: 200,
      envelope: { attackMs: 0, releaseMs: 0 }
    };

    const { left } = synthesizeNoise(config, sampleRate, rng, undefined, undefined, calibration);
    
    // Check energy in low vs high bands using a high-pass energy ratio
    // High-pass: y[n] = x[n] - x[n-1]
    let totalEnergy = 0;
    let highPassEnergy = 0;
    
    for (let i = 1; i < left.length; i++) {
        totalEnergy += left[i] * left[i];
        const hp = left[i] - left[i-1];
        highPassEnergy += hp * hp;
    }
    
    // For white noise, highPassEnergy / totalEnergy should be around 2.0 
    // (since var(x - y) = var(x) + var(y) if independent).
    // With a +40dB boost at 10kHz, the high-pass energy will dominate significantly
    // as high frequencies have much larger derivatives.
    const ratio = highPassEnergy / totalEnergy;
    
    // 10kHz is near Nyquist (22k), so a 40dB boost there makes the signal 
    // essentially high-frequency noise. The ratio should be > 3.0.
    expect(ratio).toBeGreaterThan(3.5);
  });

  it('Noise: should apply flat calibration offset to absolute level', () => {
    // This test verifies if a flat 10dB boost across the spectrum affects the final RMS.
    const calibration = {
      id: "flat-cal",
      points: [
        { frequency: 1, offsetDb: 10 },
        { frequency: 20000, offsetDb: 10 }
      ]
    };

    const config = {
      type: 'noise',
      noiseType: 'white' as const,
      levelDb: 0,
      durationMs: 100,
      envelope: { attackMs: 0, releaseMs: 0 }
    };

    const { left: raw } = synthesizeNoise(config, sampleRate, rng);
    const rmsRaw = Math.sqrt(raw.reduce((a, b) => a + b * b, 0) / raw.length);

    const { left: cal } = synthesizeNoise(config, sampleRate, rng, undefined, undefined, calibration);
    const rmsCal = Math.sqrt(cal.reduce((a, b) => a + b * b, 0) / cal.length);

    const gainDb = 20 * Math.log10(rmsCal / rmsRaw);
    
    // If this is 0, it means calibration is being normalized out of noise!
    expect(gainDb).toBeCloseTo(10, 1);
  });

  it('should handle extrapolation below minimum calibration frequency', () => {
    const calibration = {
      id: "low-extrap",
      points: [{ frequency: 1000, offsetDb: 10 }] // Single point @ 1k
    };

    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 100, levelDb: 0 }] // 100Hz is below 1k
    };

    // Log-linear extrapolation from a single point should treat it as a flat offset
    const { left } = synthesizeMultiComponent(config, sampleRate, rng, undefined, undefined, calibration);
    const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
    
    // RMS should be approx 10dB boost: 0.707 * 3.16 approx 2.236
    expect(rms).toBeCloseTo(2.236, 3);
  });

  it('should handle extrapolation above maximum calibration frequency', () => {
    const calibration = {
      id: "high-extrap",
      points: [{ frequency: 1000, offsetDb: -10 }]
    };

    const config = {
      type: 'multi_component',
      durationMs: 100,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [{ frequency: 10000, levelDb: 0 }] // 10kHz is above 1k
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, rng, undefined, undefined, calibration);
    const rms = Math.sqrt(left.reduce((a, b) => a + b * b, 0) / left.length);
    
    // RMS should be approx -10dB boost: 0.707 * 0.316 approx 0.223
    expect(rms).toBeCloseTo(0.223, 2);
  });
});
