import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Basic Frequency Discrimination
 * Classic psychophysical test of frequency resolution.
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
      { frequency: 1000, levelDb: 65, phaseDegrees: 0, ear: "both" }
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
 * Classic Profile Analysis demonstrating how onset asynchrony degrades profile cues.
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
      { frequency: 200, levelDb: 60, phaseDegrees: 5.7, ear: "both" },
      { frequency: 400, levelDb: 60, phaseDegrees: 28.6, ear: "both" },
      { frequency: 600, levelDb: 60, phaseDegrees: 68.8, ear: "both" },
      { frequency: 800, levelDb: 60, phaseDegrees: 120.3, ear: "both" },
      { frequency: 1000, levelDb: 60, phaseDegrees: 0, ear: "both" } // Target
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
 * 3. Log-Spaced Complex Detection
 * Example using the Math Toolkit for component generation.
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
      { frequency: 200, levelDb: 50, phaseDegrees: 0, ear: "both" },
      { frequency: 317.48, levelDb: 50, phaseDegrees: 68.8, ear: "both" },
      { frequency: 503.97, levelDb: 50, phaseDegrees: 137.5, ear: "both" },
      { frequency: 800, levelDb: 50, phaseDegrees: 28.6, ear: "both" }
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

/**
 * 4. Interaural Phase Difference (IPD) Discrimination (MODERN - TFS)
 * Reference: Moore (2014) "Auditory processing of temporal fine structure";
 * Prendergast et al. (2017). 
 * Highly cited paradigm for assessing hidden hearing loss / cochlear synaptopathy.
 */
export const ipdDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "IPD Discrimination (TFS)",
    version: "2.0.0",
    seed: 888,
    rationale: "Assesses sensitivity to Temporal Fine Structure (TFS) using binaural phase shifts. Impaired in Hidden Hearing Loss.",
    literature_references: ["Moore (2014) Auditory processing of temporal fine structure", "Prendergast et al. (2017)"]
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "multi_component",
    components: [
      { frequency: 500, levelDb: 70, phaseDegrees: 0, ear: "left" },
      { frequency: 500, levelDb: 70, phaseDegrees: 0, ear: "right" }
    ],
    durationMs: 400,
    globalEnvelope: { attackMs: 20, releaseMs: 20 }
  },
  perturbations: [
    {
      type: "phase_shift",
      targetFrequency: 500, 
      deltaDegrees: { adaptive: true } // Shifts the phase of the right ear component to create IPD
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
    parameter: "perturbations[0].deltaDegrees",
    initialValue: 90, // Start with a 90-degree phase shift
    stepSizes: [10, 5, 2],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: 0,
    maxValue: 180,
    reversals: 12
  },
  termination: { reversals: 12 }
};

/**
 * 5. Spatial Release from Informational Masking (MODERN)
 * Reference: Kidd Jr. et al. (2016); Gallun et al. (2013).
 * Demonstrates how spatial separation (dichotic routing) helps overcome target uncertainty.
 */
export const srimConfig: ExperimentConfig = {
  meta: {
    name: "Spatial Release from Informational Masking (SRIM)",
    version: "2.0.0",
    seed: 456,
    rationale: "Target is spatially separated from random informational maskers.",
    literature_references: ["Kidd Jr et al. (2016)", "Gallun et al. (2013)"]
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "multi_component",
    components: [
      // Informational Maskers (Left Ear)
      { frequency: 400, levelDb: 50, phaseDegrees: 12, ear: "left" },
      { frequency: 600, levelDb: 50, phaseDegrees: 90, ear: "left" },
      { frequency: 1500, levelDb: 50, phaseDegrees: 180, ear: "left" },
      { frequency: 2200, levelDb: 50, phaseDegrees: 270, ear: "left" },
      // Target Tone (Right Ear)
      { frequency: 1000, levelDb: 50, phaseDegrees: 0, ear: "right" }
    ],
    durationMs: 300,
    globalEnvelope: { attackMs: 10, releaseMs: 10 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetFrequency: 1000,
      deltaDb: { adaptive: true } // Adapt the level of the target tone
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
    parameter: "perturbations[0].deltaDb",
    initialValue: 20,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: -10,
    maxValue: 40,
    reversals: 12
  },
  termination: { reversals: 12 }
};

/**
 * 6. Threshold Equalizing Noise (TEN) Test
 * Assesses dead regions in the cochlea. Uses a broadband noise masker (simulated flat)
 * and a target tone within the noise.
 */
export const tenTestConfig: ExperimentConfig = {
  meta: {
    name: "TEN Test (Simulated)",
    version: "2.0.0",
    seed: 321,
    rationale: "Detection of a pure tone in a broadband threshold-equalizing noise.",
    literature_references: ["Moore et al. (2000)"]
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "noise",
    noiseType: "white", // Assuming flat ERB scale locally for demo
    levelDb: 70, // Background noise level
    durationMs: 500,
    envelope: { attackMs: 20, releaseMs: 20 },
    ear: "both",
    bandLimit: { lowFreq: 100, highFreq: 8000 }
  },
  perturbations: [
    {
      type: "spectral_profile", // Using our engine 'hack' to insert a tone into the noise
      targetFrequency: 1500, // Target tone frequency
      deltaDb: { adaptive: true }
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
    parameter: "perturbations[0].deltaDb",
    initialValue: 15,
    stepSizes: [4, 2],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: -10,
    maxValue: 30,
    reversals: 10
  },
  termination: { reversals: 10 }
};

/**
 * 7. Amplitude Modulation (AM) Detection
 * Tests temporal envelope processing.
 */
export const amDetectionConfig: ExperimentConfig = {
  meta: {
    name: "AM Detection",
    version: "2.0.0",
    seed: 654,
    rationale: "Detect the presence of Amplitude Modulation on a broadband noise carrier.",
    literature_references: ["Viemeister (1979) Temporal modulation transfer function"]
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "noise",
    noiseType: "white",
    levelDb: 65,
    durationMs: 500,
    envelope: { attackMs: 20, releaseMs: 20 },
    ear: "both",
    modulators: [
      { type: "AM", rateHz: 8, depth: 0 } // Carrier starts with 0 depth
    ]
  },
  perturbations: [
    {
      type: "am_depth",
      deltaDepth: { adaptive: true } // Adapt the AM depth from 0 to 1
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
    parameter: "perturbations[0].deltaDepth",
    initialValue: 0.5, // Start with 50% modulation depth
    stepSizes: [0.2, 0.1, 0.05], // linear steps in depth
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: 0,
    maxValue: 1,
    reversals: 8
  },
  termination: { reversals: 8 }
};


