import { describe, it, expect } from 'vitest';
import { synthesizeMultiComponent } from '../audio/synthesis.js';

/**
 * Analytical audit for all three ITD modes: fine_structure, envelope, both.
 *
 * The three modes test distinct perceptual phenomena:
 *   - fine_structure: carrier phase shift only — no onset delay. Used to test
 *     fine-structure-based lateralization (effective only below ~1400 Hz).
 *   - envelope: onset delay only, with fine structure preserved at the onset
 *     moment. Models envelope-based lateralization (effective at any frequency).
 *   - both: onset delay + sub-sample carrier phase shift. True lateralization.
 *
 * Sign convention: positive deltaMicroseconds = delay applied to the ear
 * specified by the `ear` field. The sound appears to come from the OPPOSITE side.
 */
describe('ITD Modes - Analytical Audit', () => {
  const sampleRate = 44100;

  // ─────────────────────────────────────────────────────
  // Mode: fine_structure
  // ─────────────────────────────────────────────────────
  describe('fine_structure mode', () => {
    it('should apply a carrier phase shift without moving the onset', () => {
      // 250 µs at 1000 Hz → phase shift = -2π * 1000 * 0.00025 = -π/2 = -90°
      // cos(0°) = 1  →  right ear first sample = cos(-90°) = 0
      // With 90° starting phase: sin(90°) = 1  →  right = sin(90° - 90°) = sin(0) = 0
      // More useful: use 0° start (default sine) so:
      //   left[0] = sin(0) = 0
      //   right[0] = sin(-π/2) = -1
      const itdUs = 250; // exactly -90° for 1000 Hz

      const config: any = {
        type: 'multi_component',
        durationMs: 50,
        components: [{ frequency: 1000, levelDb: 0, ear: 'both' }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbation: any = {
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'fine_structure',
        ear: 'right'
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

      // 1. Onset must NOT be shifted — both ears start at sample 0
      // Left ear, sample 0: sin(0) = 0
      expect(left[0]).toBeCloseTo(0, 4);

      // 2. Right ear is phase-shifted by -π/2 radians: sin(-π/2) = -1
      expect(right[0]).toBeCloseTo(-1, 3);

      // 3. Buffer lengths must be identical (no onset padding)
      expect(left.length).toBe(right.length);
    });

    it('should apply the full continuous ITD (not quantized) for phase shift', () => {
      // A 10µs ITD — sub-sample — should produce a non-zero phase shift
      // At 500 Hz: expected phase = -2π * 500 * 0.00001 = -0.03142 rad
      const itdUs = 10;
      const freq = 500;

      const config: any = {
        type: 'multi_component',
        durationMs: 50,
        // Use 90° (cosine) start so sample 0 = peak amplitude (easier to measure)
        components: [{ frequency: freq, levelDb: 0, ear: 'both', phaseDegrees: 90 }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbation: any = {
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'fine_structure',
        ear: 'right'
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

      // With 90° start phase, left[0] = cos(0) = 1.0
      // Right ear phase = 90° + (-2π * 500 * 10e-6 * 180/π) = 90° - 1.8° = 88.2°
      // right[0] = cos(-1.8°) ≈ 0.99951
      const expectedRightSample0 = Math.cos(-2 * Math.PI * freq * (itdUs / 1e6));
      expect(right[0]).toBeCloseTo(expectedRightSample0, 4);

      // The difference must be measurable (sub-sample precision proof)
      expect(Math.abs(left[0] - right[0])).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────
  // Mode: envelope
  // ─────────────────────────────────────────────────────
  describe('envelope mode', () => {
    it('should delay the onset without altering fine structure at the onset moment', () => {
      // Use an ITD large enough to quantize to exactly 2 samples
      // 2 samples at 44100 Hz = 45.35 µs → use 45µs (rounds to 2 samples)
      const itdSamples = 2;
      const itdUs = Math.round(itdSamples / sampleRate * 1e6);
      const freq = 1000;

      const config: any = {
        type: 'multi_component',
        durationMs: 50,
        components: [{ frequency: freq, levelDb: 0, ear: 'both', phaseDegrees: 90 }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbation: any = {
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'envelope',
        ear: 'right'
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

      // Key invariant: at the moment the RIGHT ear starts (sample 2),
      // its value should equal the LEFT ear's value at sample 2.
      // This proves fine structure is continuous (not reset to basePhase).
      const rightFirstSample = right[itdSamples]; // first non-zero right sample
      const leftAtSameTime  = left[itdSamples];   // left ear at same moment

      expect(rightFirstSample).toBeCloseTo(leftAtSameTime, 4);

      // Also verify onset IS shifted: right[0] and right[1] must be silent
      expect(right[0]).toBeCloseTo(0, 6);
      expect(right[1]).toBeCloseTo(0, 6);
    });

    it('should differ from both mode (both shifts onset AND changes fine structure)', () => {
      const itdUs = 500; // 22 samples at 44.1kHz
      const freq = 1000;
      const config: any = {
        type: 'multi_component',
        durationMs: 50,
        components: [{ frequency: freq, levelDb: 0, ear: 'both', phaseDegrees: 90 }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbationEnv: any = { type: 'itd', deltaMicroseconds: itdUs, mode: 'envelope', ear: 'right' };
      const perturbationBoth: any = { type: 'itd', deltaMicroseconds: itdUs, mode: 'both', ear: 'right' };

      const { right: rightEnv } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbationEnv]);
      const { right: rightBoth } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbationBoth]);

      // Find the onset sample (first non-zero value after the offset)
      const onsetSample = Math.round(itdUs / 1e6 * sampleRate);

      // Both have the same onset offset. The difference is the fine structure:
      // - envelope: right[onset] ≈ left[onset] (fine structure aligned)
      // - both: right[onset] ≠ left[onset] (fine structure shifted)
      // So rightEnv and rightBoth should be different at the onset
      expect(rightEnv[onsetSample]).not.toBeCloseTo(rightBoth[onsetSample], 2);
    });
  });

  // ─────────────────────────────────────────────────────
  // Mode: both (True Lateralization)
  // ─────────────────────────────────────────────────────
  describe('both mode', () => {
    it('should shift onset AND apply sub-sample phase compensation to the residual', () => {
      // 300 Hz, 500µs ITD → phase shift = -54° (clearly non-zero, not a zero crossing)
      // fine_structure mode: phase-only shift, no onset delay → active from sample 0
      // both mode: onset shift (22 samples) + fractional phase → silent for 22 samples
      // After the onset, both modes produce the same carrier trajectory (by design:
      // the integer-sample onset + fractional phase compensation reconstructs continuity).
      const itdUs = 500;
      const freq = 300;
      const onsetSamples = Math.round(itdUs / 1e6 * sampleRate); // = 22

      const config: any = {
        type: 'multi_component',
        durationMs: 100,
        components: [{ frequency: freq, levelDb: 0, ear: 'both', phaseDegrees: 90 }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbationFS: any   = { type: 'itd', deltaMicroseconds: itdUs, mode: 'fine_structure', ear: 'right' };
      const perturbationBoth: any = { type: 'itd', deltaMicroseconds: itdUs, mode: 'both', ear: 'right' };

      const { right: rightFS }   = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbationFS]);
      const { right: rightBoth } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbationBoth]);

      // fine_structure: active from sample 0 (no onset delay)
      expect(Math.abs(rightFS[0])).toBeGreaterThan(0.3);

      // both: silent for the first onsetSamples, then active
      for (let i = 0; i < onsetSamples; i++) {
        expect(rightBoth[i]).toBeCloseTo(0, 5);
      }
      expect(Math.abs(rightBoth[onsetSamples])).toBeGreaterThan(0.3);

      // After onset, both modes reconstruct continuous phase — steady-state is identical.
      // This is the CORRECT behavior: onset + subSamplePhaseShift = continuous carrier.
      let postOnsetDiff = 0;
      for (let i = onsetSamples; i < onsetSamples + 100; i++) {
        postOnsetDiff += Math.abs(rightFS[i] - rightBoth[i]);
      }
      // Post-onset the carrier phase should match (within floating-point tolerance)
      expect(postOnsetDiff).toBeLessThan(0.01);
    });
  });

  // ─────────────────────────────────────────────────────
  // Negative ITD
  // ─────────────────────────────────────────────────────
  describe('negative ITD', () => {
    it('should handle negative deltaMicroseconds correctly via globalOffsetMs', () => {
      // A negative ITD means the left ear is delayed — the right ear leads
      // The buffer must expand (via globalOffsetMs) to accommodate the early-starting ear
      const freq = 1000;
      const itdUs = -500; // Right leads by 500µs

      const config: any = {
        type: 'multi_component',
        durationMs: 50,
        components: [{ frequency: freq, levelDb: 0, ear: 'both', phaseDegrees: 90 }],
        globalEnvelope: { attackMs: 0, releaseMs: 0 }
      };

      const perturbation: any = {
        type: 'itd',
        deltaMicroseconds: itdUs,
        mode: 'both',
        ear: 'right'
      };

      const { left, right } = synthesizeMultiComponent(config, sampleRate, () => 0.5, [perturbation]);

      // With a negative ITD on the right ear, the right ear is ADVANCED
      // (onsetOffsetMs becomes negative), so the left ear is relatively delayed.
      // The buffer is expanded via globalOffsetMs, and left should have leading silence.
      const itdSamples = Math.round(Math.abs(itdUs) / 1e6 * sampleRate);

      // Left ear should be silent for the first |itdSamples| samples
      for (let i = 0; i < itdSamples; i++) {
        expect(left[i]).toBeCloseTo(0, 5);
      }

      // Right ear should be active from sample 0
      expect(Math.abs(right[0])).toBeGreaterThan(0.5);
    });
  });
});
