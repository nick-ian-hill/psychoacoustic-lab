import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Basic Frequency Discrimination (Classic)
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
      targetHarmonic: 1,
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
    initialValue: 5,
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
 * 2. Intensity Discrimination (Classic)
 * Just-Noticeable Difference (JND) for sound level.
 */
export const intensityDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "Intensity Discrimination",
    version: "1.0.0",
    seed: 456,
    rationale: "Classic JND measurement for intensity using a pedestal tone."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "tone",
    frequency: 1000,
    levelDb: 70,
    duration: 500,
    envelope: { attack: 20, release: 20 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetHarmonic: 1,
      deltaDb: { adaptive: true } as any
    }
  ],
  conditions: { reference: {}, target: {} },
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isi: 500 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 6,
    stepSizes: [2, 1, 0.5],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: 0,
    maxValue: 20,
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
      delayMs: -100
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

/**
 * 4. Tone in Noise (Classic)
 * Detection of a tone in broadband white noise.
 */
export const toneInNoiseConfig: ExperimentConfig = {
  meta: {
    name: "Tone in Noise Detection",
    version: "1.0.0",
    seed: 777,
    rationale: "Classical simultaneous masking measurement."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "noise",
    noiseType: "white",
    levelDb: 50,
    duration: 1000,
    envelope: { attack: 50, release: 50 }
  },
  perturbations: [
    {
      type: "spectral_profile", // We use spectral profile to 'add' the tone component
      targetHarmonic: 0, // Special case for noise + tone? Or we need a better schema
      deltaDb: { adaptive: true } as any
    }
  ],
  conditions: { reference: {}, target: {} },
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isi: 500 }
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
 * 5. Informational Masking with Random Maskers (Modern)
 * Detection of a target tone among random frequency maskers.
 */
export const infoMaskingConfig: ExperimentConfig = {
  meta: {
    name: "Informational Masking: Random Multi-tone Maskers",
    version: "1.0.0",
    seed: 888,
    rationale: "Recent paradigm studying central vs peripheral masking using uncertain masker frequencies."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "component_complex",
    components: [
      { frequency: 400, levelDb: 50 },
      { frequency: 600, levelDb: 50 },
      { frequency: 1500, levelDb: 50 },
      { frequency: 2200, levelDb: 50 }
    ],
    duration: 300,
    envelope: { attack: 10, release: 10 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetHarmonic: 1000, // Explicit frequency target
      deltaDb: { adaptive: true } as any
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
    parameter: "perturbations[0].deltaDb",
    initialValue: 25,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    minValue: -10,
    maxValue: 50,
    reversals: 12
  },
  termination: { reversals: 12 }
};
