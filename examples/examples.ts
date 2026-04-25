import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Basic Frequency Discrimination
 */
export const freqDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "Frequency Discrimination",
    version: "1.0.0",
    seed: 123,
    rationale: "Threshold for detecting frequency difference between two tones."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "tone",
    frequency: 1000,
    levelDb: 65,
    duration: 250,
    envelope: { attack: 10, release: 10 }
  },
  perturbations: [
    {
      type: "mistuning",
      targetHarmonic: 1, // For a pure tone, we treat it as harmonic 1
      deltaPercent: { adaptive: true } as any
    }
  ],
  conditions: { reference: {}, target: {} },
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isi: 400 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaPercent",
    initialValue: 5, // 5% mistuning
    stepSizes: [2, 1, 0.5, 0.25],
    rule: { correctDown: 3, incorrectUp: 1 },
    initialN: 1,
    switchReversalCount: 2,
    minValue: 0,
    maxValue: 50,
    reversals: 12
  },
  termination: { reversals: 12 }
};

/**
 * 3. Auditory Grouping (Hill & Bailey)
 * Profile analysis with an asynchronous target.
 */
export const auditoryGroupingConfig: ExperimentConfig = {
  meta: {
    name: "Auditory Grouping: Asynchronous Target",
    version: "1.0.0",
    seed: 999,
    rationale: "Replicating the effect where onset asynchrony reduces the ability to perform profile analysis."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "harmonic_complex",
    f0: 200,
    harmonics: { from: 1, to: 21 },
    amplitudeProfile: { type: "flat", levelDb: 60 },
    phase: "random",
    duration: 500,
    envelope: { attack: 10, release: 10 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetHarmonic: 11,
      deltaDb: { adaptive: true } as any
    },
    {
      type: "onset_asynchrony",
      targetHarmonic: 11,
      delayMs: -100 // Target starts 100ms BEFORE the complex
    }
  ],
  conditions: { reference: {}, target: {} },
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isi: 600 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 15,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    initialN: 1,
    switchReversalCount: 2,
    minValue: 0,
    maxValue: 40,
    reversals: 12
  },
  termination: { reversals: 12 }
};
