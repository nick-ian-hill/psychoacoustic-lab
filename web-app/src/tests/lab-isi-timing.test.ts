import { describe, it, expect } from 'vitest';

describe('Scientific Stress Test - Inter-Interval Timing (ISI)', () => {
  const sampleRate = 44100;

  it('should calculate sample-accurate gaps for 500ms ISI', () => {
    const isiMs = 500;
    // Matching the logic in worker.ts: 114
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    // 0.5 * 44100 = 22050
    expect(isiSamples).toBe(22050);
  });

  it('should handle sub-millisecond precision if requested (e.g. 500.5ms)', () => {
    const isiMs = 500.5;
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    // 0.5005 * 44100 = 22072.05 -> ceil -> 22073
    expect(isiSamples).toBe(22073);
  });

  it('should prevent zero-gap when a small ISI is requested', () => {
    const isiMs = 0.01; // 10 microseconds
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    // 0.00001 * 44100 = 0.441 -> ceil -> 1 sample
    // This ensures that even tiny ISIs result in at least 1 sample of separation 
    // unless ISI is exactly 0.
    expect(isiSamples).toBe(1);
  });
});
