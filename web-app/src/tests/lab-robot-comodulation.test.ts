import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

/**
 * This audit verifies if modulators across different components remain 
 * synchronized (comodulated) even when they have different onsets.
 */
describe('Robot Observer - Comodulation Sync Audit', () => {
  const sampleRate = 44100;
  
  it('should maintain perfect AM correlation across components with different onsets', () => {
    const amFreq = 10; // 10Hz = 100ms period
    
    const config: any = {
      type: 'multi_component',
      durationMs: 200,
      components: [
        { 
          frequency: 1000, 
          levelDb: 0, 
          onsetDelayMs: 0,
          phaseDegrees: 90, // Cosine start
          modulators: [{ type: 'AM', rateHz: amFreq, depth: 1, phaseDegrees: 90 }] 
        },
        { 
          frequency: 2000, 
          levelDb: 0, 
          onsetDelayMs: 50, 
          phaseDegrees: 90, 
          modulators: [{ type: 'AM', rateHz: amFreq, depth: 1, phaseDegrees: 90 }] 
        }
      ],
      globalEnvelope: { attackMs: 0, releaseMs: 0 }
    };

    const { left } = synthesizeMultiComponent(config, sampleRate, () => 0.5);

    const sample100ms = Math.floor(0.1 * sampleRate);
    const sample150ms = Math.floor(0.15 * sampleRate);

    const amp100 = Math.abs(left[sample100ms]);
    const amp150 = Math.abs(left[sample150ms]);

    // If perfectly comodulated:
    // t=100ms: Tone 1 Peak (1.0) + Tone 2 Peak (1.0) = 2.0
    // t=150ms: Tone 1 Trough (0.0) + Tone 2 Trough (0.0) = 0.0
    
    // If local sync (buggy):
    // t=100ms: Tone 1 Peak (1.0) + Tone 2 Trough (0.0) = 1.0
    
    expect(amp100, 'Modulators are de-correlated! Tone 2 started AM from its local onset.').toBeGreaterThan(1.5);
    expect(amp150, 'Modulators are de-correlated! Troughs do not align.').toBeLessThan(0.5);
  });
});
