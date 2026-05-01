import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

describe('Scientific Guard - Saturation & Clipping', () => {
  const sampleRate = 44100;

  it('should detect when summing components exceeds 0dBFS (1.0 amplitude)', () => {
    // Generate two 0dB tones (amplitude 1.0 each)
    // When summed, they will reach 2.0 amplitude.
    const config = {
      type: 'multi_component' as const,
      durationMs: 10,
      globalEnvelope: { attackMs: 0, releaseMs: 0 },
      components: [
        { frequency: 1000, levelDb: 0, phaseDegrees: 0, ear: 'both' as const },
        { frequency: 1000, levelDb: 0, phaseDegrees: 0, ear: 'both' as const }
      ]
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, Math.random);
    
    let maxPeak = 0;
    for (let i = 0; i < left.length; i++) {
        maxPeak = Math.max(maxPeak, Math.abs(left[i]));
    }

    // CURRENT BEHAVIOR: The engine does not explicitly clip in the Float32Array.
    // This allows the caller to handle normalization or warnings.
    // We verify this behavior so we can decide if we want to add a "Hard Clipper".
    expect(maxPeak).toBeGreaterThan(1.0);
    expect(maxPeak).toBeCloseTo(2.0, 4);
  });
});
