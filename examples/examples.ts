import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Basic Frequency Discrimination
 */
export const freqDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "Frequency Discrimination",
    version: "2.0.0",
    seed: 123,
    rationale: "Threshold for detecting frequency difference."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "multi_component",
    components: [
      { frequency: 1000, levelDb: 65, phaseDegrees: 0 }
    ],
    durationMs: 250,
    globalEnvelope: { attackMs: 10, releaseMs: 10 }
  },
  perturbations: [
    {
      type: "mistuning",
      targetFrequency: 1000,
      deltaPercent: { adaptive: true }
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 400 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaPercent",
    initialValue: 5,
    stepSizes: [2, 1, 0.5, 0.25],
    rule: { correctDown: 3, incorrectUp: 1 },
    minValue: 0,
    maxValue: 50,
    reversals: 12
  },
  termination: { reversals: 12 }
};

/**
 * 2. Harmonic Complex with Lead Target (Hill & Bailey)
 */
export const auditoryGroupingConfig: ExperimentConfig = {
  meta: {
    name: "Auditory Grouping: Lead Target",
    version: "2.0.0",
    seed: 999,
    rationale: "Using explicit components to model onset asynchrony LEAD."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "multi_component",
    components: [
      { frequency: 200, levelDb: 60, phaseDegrees: 5.7 },
      { frequency: 400, levelDb: 60, phaseDegrees: 28.6 },
      { frequency: 600, levelDb: 60, phaseDegrees: 68.8 },
      { frequency: 800, levelDb: 60, phaseDegrees: 120.3 },
      { frequency: 1000, levelDb: 60, phaseDegrees: 0 } // Target component
    ],
    durationMs: 500,
    globalEnvelope: { attackMs: 10, releaseMs: 10 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetFrequency: 1000,
      deltaDb: { adaptive: true }
    },
    {
      type: "onset_asynchrony",
      targetFrequency: 1000,
      delayMs: -100 // Target leads by 100ms
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 600 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 15,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: 0,
    maxValue: 40,
    reversals: 12
  },
  termination: { reversals: 12 }
};

/**
 * 3. Log-Spaced Complex (Finalized via Toolkit)
 */
export const logSpacedConfig: ExperimentConfig = {
  meta: {
    name: "Log-Spaced Detection",
    version: "2.0.0",
    seed: 777,
    rationale: "Explicit components calculated via calc_frequencies toolkit."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "multi_component",
    components: [
      { frequency: 200, levelDb: 50, phaseDegrees: 0 },
      { frequency: 317.48, levelDb: 50, phaseDegrees: 68.8 },
      { frequency: 503.97, levelDb: 50, phaseDegrees: 137.5 },
      { frequency: 800, levelDb: 50, phaseDegrees: 28.6 }
    ],
    durationMs: 400,
    globalEnvelope: { attackMs: 20, releaseMs: 20 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetFrequency: 503.97,
      deltaDb: { adaptive: true }
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 500 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 10,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: 0,
    maxValue: 40,
    reversals: 12
  },
  termination: { reversals: 12 }
};
