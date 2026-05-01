import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

describe('Harmonic Complexes - Phase Roving & Crest Factor', () => {
  const sampleRate = 44100;
  const numComponents = 10;
  const f0 = 200;

  const calculateCrestFactor = (samples: Float32Array) => {
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / samples.length);
    return peak / rms;
  };

  it('should have a high crest factor for zero-phase harmonics', () => {
    const components = Array.from({ length: numComponents }, (_, i) => ({
      frequency: f0 * (i + 1),
      levelDb: -20,
      phaseDegrees: 90
    }));

    const config = {
      type: 'multi_component',
      durationMs: 50,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, Math.random);
    const cf = calculateCrestFactor(left);
    
    // For many in-phase harmonics, peak is N * amplitude, RMS is sqrt(N/2) * amplitude
    // CF is approx sqrt(2N). For N=10, CF approx 4.47
    expect(cf).toBeGreaterThan(4.0);
  });

  it('should have a lower crest factor for random-phase harmonics', () => {
    // We use a fixed seed for reproducibility in the test, 
    // but the generator should use its internal logic if phaseDegrees is missing.
    // Wait, synthesizeMultiComponent doesn't auto-randomize phases if missing, it uses 0.
    // Let's check shared/schema.ts: phaseDegrees is optional.
    
    // In synthesis.ts: const basePhase = (comp.phaseDegrees || 0) * Math.PI / 180;
    // So if missing, it's 0.
    
    // We need to use perturbations to achieve phase roving or define them in components.
    
    const components = Array.from({ length: numComponents }, (_, i) => ({
      frequency: f0 * (i + 1),
      levelDb: -20,
      phaseDegrees: Math.random() * 360 // Manual roving for this test
    }));

    const config = {
      type: 'multi_component',
      durationMs: 50,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, Math.random);
    const cf = calculateCrestFactor(left);
    
    expect(cf).toBeLessThan(4.0);
  });

  it('should implement Schroeder phase correctly for minimum crest factor', () => {
    const components = Array.from({ length: numComponents }, (_, i) => {
      const n = i + 1;
      const phaseRad = Math.PI * n * (n - 1) / numComponents;
      return {
        frequency: f0 * n,
        levelDb: -20,
        phaseDegrees: phaseRad * 180 / Math.PI
      };
    });

    const config = {
      type: 'multi_component',
      durationMs: 50,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, Math.random);
    const cf = calculateCrestFactor(left);
    
    // Schroeder phase usually gets CF below 3.0 for 10 components
    expect(cf).toBeLessThan(3.0);
  });
});
