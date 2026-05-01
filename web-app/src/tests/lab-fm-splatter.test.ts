import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

describe('Scientific Stress Test - FM Spectral Splatter', () => {
  const sampleRate = 44100;

  // Re-using the DFT helper from lab-spectral
  const getMagnitudeAtFreq = (samples: Float32Array, targetFreq: number, sr: number) => {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < samples.length; n++) {
      const angle = (2 * Math.PI * targetFreq * n) / sr;
      real += samples[n] * Math.cos(angle);
      imag += samples[n] * Math.sin(angle);
    }
    return Math.sqrt(real * real + imag * imag) / samples.length;
  };

  it('should contain energy within expected sidebands for 50Hz FM', () => {
    const carrier = 1000;
    const rate = 50;
    const depth = 200; // Swing +/- 200Hz
    const durationMs = 200;

    const config = {
      type: 'multi_component' as const,
      durationMs,
      globalEnvelope: { attackMs: 20, releaseMs: 20 }, // Windowing helps spectral analysis
      components: [{
        frequency: carrier,
        levelDb: 0,
        modulators: [{ type: 'FM' as const, depth, rateHz: rate, phaseDegrees: 0 }]
      }]
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, Math.random);

    // Main energy should be around carrier
    const magCarrier = getMagnitudeAtFreq(left, carrier, sampleRate);
    
    // Check sidebands at fc +/- fm
    const magUpper = getMagnitudeAtFreq(left, carrier + rate, sampleRate);
    const magLower = getMagnitudeAtFreq(left, carrier - rate, sampleRate);

    // Verify sidebands are present
    expect(magUpper).toBeGreaterThan(0.01);
    expect(magLower).toBeGreaterThan(0.01);

    // Check "Splatter" area far away (e.g., 2000Hz)
    const magSplatter = getMagnitudeAtFreq(left, 2500, sampleRate);
    
    // Energy far away should be much lower (at least 40dB down)
    expect(magSplatter).toBeLessThan(magCarrier * 0.01); 
  });
});
