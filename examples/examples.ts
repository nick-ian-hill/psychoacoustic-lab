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
    rationale: "Threshold for detecting frequency difference.",
    summary: "Select the HIGHER pitched tone.",
    description: "Two tones will play in sequence. Which interval contained the HIGHER pitched tone? Press Interval 1 or Interval 2."

  },
  audio: { sampleRate: 44100 },
  stimuli: [{
    type: "multi_component",
    components: [
      { frequency: 1000, levelDb: 65, phaseDegrees: 0, ear: "both" }
    ],
    durationMs: 250,
    globalEnvelope: { attackMs: 10, releaseMs: 10, type: "linear" }
  }],
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
    timing: { isiMs: 400, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaPercent",
    initialValue: 5,
    stepType: "geometric",
    stepSizes: [2, 1.414, 1.189],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 50,
    reversals: 12,
    unit: "%"
  },
  ui: { showCurrentValue: true },
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
    rationale: "Using explicit components to model onset asynchrony LEAD.",
    summary: "Select the interval with the louder tone.",
    description: "Two chord-like sounds will play. One interval contains a tone that is slightly louder than the others. Which interval was it? Press Interval 1 or Interval 2."

  },
  audio: { sampleRate: 44100 },
  stimuli: [{
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
  }],
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
    timing: { isiMs: 600, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 15, // Increased from 10 for gentler start
    stepSizes: [2, 1, 0.5],
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 40,
    reversals: 12,
    unit: "dB"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 12 }
};

/**
 * 3. ITD/IPD Discrimination (MODERN - TFS)
 * Reference: Klumpp & Eady (1956); Moore (2014)
 * Uses the high-level 'itd' perturbation to automatically handle phase-shifting
 * based on the component frequency.
 */
export const itdDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "ITD/IPD Discrimination",
    version: "2.0.0",
    seed: 888,
    rationale: "Assesses sensitivity to Temporal Fine Structure (TFS) using the high-level 'itd' perturbation.",
    summary: "Select the OFF-CENTRE interval.",
    description: "Listen on headphones. One interval sounds centered; the other sounds shifted to one side. Which interval sounded OFF-CENTRE? Press Interval 1 or Interval 2.",
    literature_references: ["Klumpp & Eady (1956)", "Moore (2014)"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [{
    type: "multi_component",
    components: [
      { frequency: 500, levelDb: 70, phaseDegrees: 0, ear: "both" }
    ],
    durationMs: 400,
    globalEnvelope: { attackMs: 20, releaseMs: 20 }
  }],
  perturbations: [
    {
      type: "itd",
      mode: "fine_structure", // Only shift phase (IPD)
      ear: "right", // Delay the right ear
      deltaMicroseconds: { adaptive: true }
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 500, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaMicroseconds",
    initialValue: 100,
    stepType: "geometric",
    stepSizes: [2, 1.414, 1.189],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 1000,
    reversals: 12,
    unit: "\u03BCs" // Microseconds symbol
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 12 }
};

/**
 * 4. Spatial Release from Informational Masking (MODERN)
 * Reference: Kidd Jr. et al. (2016); Gallun et al. (2013).
 * Demonstrates how spatial separation (dichotic routing) helps overcome target uncertainty.
 */
export const srimConfig: ExperimentConfig = {
  meta: {
    name: "Spatial Release from Informational Masking (SRIM)",
    version: "2.0.0",
    seed: 456,
    rationale: "Target is spatially separated from random informational maskers.",
    summary: "Select the interval with the right-ear tone.",
    description: "Use headphones. One interval contains a faint tone in your RIGHT ear amongst other sounds. Which interval contained the right-ear tone? Press Interval 1 or Interval 2.",
    literature_references: ["Kidd Jr et al. (2016)", "Gallun et al. (2013)"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [{
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
  }],
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
    timing: { isiMs: 400, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 20,
    stepSizes: [4, 2, 1.414],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: -10,
    maxValue: 40,
    reversals: 12,
    unit: "dB"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 12 }
};

/**
 * 5. Threshold Equalizing Noise (TEN) Test
 * Assesses dead regions in the cochlea. Uses a broadband noise masker (simulated flat)
 * and a target tone within the noise.
 */
export const tenTestConfig: ExperimentConfig = {
  meta: {
    name: "TEN Test (Simulated)",
    version: "2.0.0",
    seed: 321,
    rationale: "Detection of a pure tone in a broadband threshold-equalizing noise.",
    summary: "Select the interval containing the faint tone.",
    description: "Two bursts of noise will play. One interval contains a faint tone hidden within the noise. Which interval contained the tone? Press Interval 1 or Interval 2.",
    literature_references: ["Moore et al. (2000)"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [
    {
      type: "noise",
      noiseType: "white", // Assuming flat ERB scale locally for demo
      levelDb: 70, // Background noise level
      durationMs: 500,
      envelope: { attackMs: 20, releaseMs: 20 },
      ear: "both",
      bandLimit: { lowFreq: 100, highFreq: 8000 },
      applyTo: "all"
    },
    {
      type: "multi_component",
      components: [
        { frequency: 1500, levelDb: 70, phaseDegrees: 0, ear: "both" }
      ],
      durationMs: 500,
      globalEnvelope: { attackMs: 20, releaseMs: 20 },
      applyTo: "target" // This tone only appears in the target interval
    }
  ],
  perturbations: [
    {
      type: "spectral_profile",
      targetFrequency: 1500,
      deltaDb: { adaptive: true } // Adjust level relative to the base 70 dB
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 400, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 20,
    stepSizes: [2, 1],
    rule: { correctDown: 2 },
    minValue: -10,
    maxValue: 30,
    reversals: 10,
    unit: "dB"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 10 }
};

/**
 * 6. Amplitude Modulation (AM) Detection
 * Tests temporal envelope processing.
 */
export const amDetectionConfig: ExperimentConfig = {
  meta: {
    name: "AM Detection",
    version: "2.0.0",
    seed: 654,
    rationale: "Detect the presence of Amplitude Modulation on a broadband noise carrier.",
    summary: "Select the FLUCTUATING interval.",
    description: "Two bursts of noise will play. One interval has a rhythmic 'wah-wah' fluctuation; the other is steady. Which interval was FLUCTUATING? Press Interval 1 or Interval 2.",
    literature_references: ["Viemeister (1979) Temporal modulation transfer function"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [{
    type: "noise",
    noiseType: "white",
    levelDb: 65,
    durationMs: 500,
    envelope: { attackMs: 20, releaseMs: 20 },
    ear: "both",
    modulators: [
      { type: "AM", rateHz: 8, depth: 0 } // Carrier starts with 0 depth
    ]
  }],
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
    timing: { isiMs: 500, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDepth",
    initialValue: 1.0,
    stepType: "geometric",
    stepSizes: [2, 1.414, 1.189],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 1,
    reversals: 8,
    unit: "depth"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 8 }
};

/**
 * 7. Profile Analysis (Green, 1988)
 * Demonstrates complex masking, global level roving, and individual component level randomization.
 */
export const profileAnalysisConfig: ExperimentConfig = {
  meta: {
    name: "Profile Analysis",
    version: "2.0.0",
    seed: 111,
    rationale: "Detect an intensity increment in one component of a multi-tone complex. Global and individual roving force the listener to use spectral shape (profile) cues rather than absolute loudness.",
    summary: "Select the interval with the louder middle tone.",
    description: "Two sounds will play. One has a slightly different 'timbre' or 'shape' because the middle tone is louder. Which interval was it? Press Interval 1 or Interval 2.",
    literature_references: ["Green (1988) Profile Analysis"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [{
    type: "multi_component",
    components: [
      { frequency: 200, levelDb: 50, phaseDegrees: 0 },
      { frequency: 400, levelDb: 50, phaseDegrees: 0 },
      { frequency: 800, levelDb: 50, phaseDegrees: 0 }, // Target
      { frequency: 1600, levelDb: 50, phaseDegrees: 0 },
      { frequency: 3200, levelDb: 50, phaseDegrees: 0 }
    ],
    durationMs: 300,
    globalEnvelope: { attackMs: 10, releaseMs: 10 }
  }],
  perturbations: [
    // Global Level Roving: Applies to ALL intervals independently. +- 5 dB.
    {
      type: "gain",
      applyTo: "all",
      deltaDb: { type: "uniform", min: -5, max: 5 }
    },
    // Individual Component Roving: Applies to ALL intervals independently. +- 2 dB per component.
    { type: "spectral_profile", targetFrequency: 200, applyTo: "all", deltaDb: { type: "uniform", min: -2, max: 2 } },
    { type: "spectral_profile", targetFrequency: 400, applyTo: "all", deltaDb: { type: "uniform", min: -2, max: 2 } },
    { type: "spectral_profile", targetFrequency: 800, applyTo: "all", deltaDb: { type: "uniform", min: -2, max: 2 } },
    { type: "spectral_profile", targetFrequency: 1600, applyTo: "all", deltaDb: { type: "uniform", min: -2, max: 2 } },
    { type: "spectral_profile", targetFrequency: 3200, applyTo: "all", deltaDb: { type: "uniform", min: -2, max: 2 } },
    // Target Signal: An adaptive increment added ONLY to the 800 Hz component in the TARGET interval.
    {
      type: "spectral_profile",
      targetFrequency: 800,
      applyTo: "target",
      deltaDb: { adaptive: true }
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 500, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[6].deltaDb", // The 7th perturbation is the adaptive one
    initialValue: 15,
    stepType: "geometric",
    stepSizes: [2, 1.414, 1.189],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 30,
    reversals: 12,
    unit: "dB"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 12 }
};

/**
 * 8. Gap Detection in Noise
 * Tests temporal resolution.
 */
export const gapDetectionConfig: ExperimentConfig = {
  meta: {
    name: "Gap Detection",
    version: "2.0.0",
    seed: 777,
    rationale: "Threshold for detecting a temporal gap in a broadband noise.",
    summary: "Select the interval with the GAP.",
    description: "Two bursts of noise will play. In one interval, there is a very brief silence (a gap) in the middle of the noise. Which interval had the GAP? Press Interval 1 or Interval 2.",
    literature_references: ["Plomp (1964)"]
  },
  audio: { sampleRate: 44100 },
  stimuli: [
    {
      type: "noise",
      noiseType: "white",
      levelDb: 65,
      durationMs: 250,
      envelope: { attackMs: 10, releaseMs: 1 }, // Sharp release for the first burst
      ear: "both"
    },
    {
      type: "noise",
      noiseType: "white",
      levelDb: 65,
      durationMs: 250,
      envelope: { attackMs: 1, releaseMs: 10 }, // Sharp attack for the second burst
      ear: "both",
      onsetDelayMs: 250 // Starts immediately after the first burst (250ms) in reference
    }
  ],
  perturbations: [
    {
      type: "onset_asynchrony",
      targetGeneratorIndex: 1, // Target the second noise generator
      delayMs: { adaptive: true } // This delay added to onsetDelayMs creates the gap
    }
  ],
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isiMs: 500, itiMs: 1000 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].delayMs",
    initialValue: 20,
    stepType: "geometric",
    stepSizes: [2, 1.414, 1.189],
    stepSizeInterval: 2,
    rule: { correctDown: 2 },
    minValue: 0,
    maxValue: 100,
    reversals: 12,
    unit: "ms"
  },
  ui: { showCurrentValue: true },
  termination: { reversals: 12 }
};

