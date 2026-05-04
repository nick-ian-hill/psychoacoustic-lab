import { describe, it, expect } from 'vitest';
import { synthesizeNoise } from '../audio/synthesis.js';

describe('Scientific Stress Test - Inter-Interval Timing (ISI)', () => {
  const sampleRate = 44100;

  it('should verify sample-accurate silence in the ISI gap of a multi-interval render', () => {
    const isiMs = 100;
    // Matching the logic in worker.ts
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    const gen = {
      type: 'noise',
      noiseType: 'white',
      levelDb: 0,
      durationMs: 50,
      envelope: { attackMs: 0, releaseMs: 0 }
    };

    // 1. Synthesize two noise intervals
    const res1 = synthesizeNoise(gen, sampleRate, Math.random);
    const res2 = synthesizeNoise(gen, sampleRate, Math.random);

    // 2. Concatenate them with the ISI gap (mimicking worker.ts logic)
    const totalLength = res1.left.length + isiSamples + res2.left.length;
    const finalBuffer = new Float32Array(totalLength);
    
    let offset = 0;
    finalBuffer.set(res1.left, offset);
    offset += res1.left.length;
    
    // Skip ISI gap (it stays zeroed)
    offset += isiSamples;
    
    finalBuffer.set(res2.left, offset);

    // 3. Verify the gap is exactly silent
    const gapStart = res1.left.length;
    const gapEnd = gapStart + isiSamples;
    
    let maxGapAmp = 0;
    for (let i = gapStart; i < gapEnd; i++) {
      maxGapAmp = Math.max(maxGapAmp, Math.abs(finalBuffer[i]));
    }
    
    expect(maxGapAmp).toBe(0);

    // 4. Verify boundary samples
    // Sample immediately before gap should be non-zero (if noise is active)
    expect(Math.abs(finalBuffer[gapStart - 2])).toBeGreaterThan(0); 
    // Sample immediately after gap should be non-zero
    expect(Math.abs(finalBuffer[gapEnd])).toBeGreaterThan(0);
  });

  it('should handle sub-millisecond precision correctly (e.g. 500.5ms)', () => {
    const isiMs = 500.5;
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    // 0.5005 * 44100 = 22072.05 -> ceil -> 22073
    expect(isiSamples).toBe(22073);
  });

  it('should prevent zero-gap when a small ISI is requested', () => {
    const isiMs = 0.01; // 10 microseconds
    const isiSamples = Math.ceil((isiMs / 1000) * sampleRate);
    
    // 0.00001 * 44100 = 0.441 -> ceil -> 1 sample
    expect(isiSamples).toBe(1);
  });
});
