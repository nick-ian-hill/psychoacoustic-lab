import { describe, it, expect } from 'vitest';
import { normalizeStereo } from '../audio/synthesis.js';

describe('Normalization Guard - Safety Clamping', () => {
  it('should clamp peak amplitude to exactly 0.9 if it exceeds threshold', () => {
    // Create a signal with a peak of 10.0
    const left = new Float32Array([0, 5, 10, 5, 0]);
    const right = new Float32Array([0, 0, 0, 0, 0]);
    
    normalizeStereo(left, right);
    
    // Max peak was 10.0, target is 0.9
    // Scale factor should be 0.09
    expect(left[2]).toBeCloseTo(0.9, 5);
    expect(left[1]).toBeCloseTo(0.45, 5);
  });

  it('should leave signals below 0.9 peak untouched', () => {
    const left = new Float32Array([0, 0.4, 0.8, 0.4, 0]);
    const right = new Float32Array([0, 0.4, 0.8, 0.4, 0]);
    
    const leftOrig = new Float32Array(left);
    normalizeStereo(left, right);
    
    expect(Array.from(left)).toEqual(Array.from(leftOrig));
  });

  it('should handle stereo peaks correctly (Right channel dominant)', () => {
    const left = new Float32Array([0.1, 0.1, 0.1]);
    const right = new Float32Array([0.1, 2.0, 0.1]);
    
    normalizeStereo(left, right);
    
    // Scale factor should be 0.9 / 2.0 = 0.45
    expect(right[1]).toBeCloseTo(0.9, 5);
    expect(left[1]).toBeCloseTo(0.045, 5);
  });
});
