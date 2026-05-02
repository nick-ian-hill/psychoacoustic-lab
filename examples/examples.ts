import type { ExperimentConfigInput } from "../shared/schema.js";

/**
 * 1. Practice & Test (Onboarding)
 * 2AFC, 5 Trials
 */
export const pitchDiscriminationConfig: ExperimentConfigInput = {
  meta: {
    name: "Pitch sensitivity",
    version: "2.2.0",
    summary: "Select the HIGHER pitched tone.",
    description: "Welcome! We will start with a quick training phase to help you get used to the sounds. Identify the interval with the higher pitch."
  },
  ui: {
    showCurrentValue: true,
  },
  blocks: [
    {
      id: "practice",
      feedback: true,
      meta: {
        "seed": 777,
        summary: "PRACTICE PHASE:\nSelect the interval with the higher pitch tone.\nGet 5 correct to advance."
      },
      ui: {
        showTrialNumber: true,
        showCurrentValue: false
      },
      paradigm: {
        type: "m-AFC",
        intervals: [{ condition: "reference" }, { condition: "target" }],
        randomizeOrder: true,
        timing: { isiMs: 400, itiMs: 1000 }
      },
      stimuli: [{
        type: "multi_component",
        components: [{ frequency: 1000, levelDb: 55, phaseDegrees: 0, ear: "both" }],
        durationMs: 300,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
      }],
      perturbations: [{
        type: "mistuning",
        targetFrequency: 1000,
        deltaPercent: 8
      }],
      termination: { correctTrials: 5 }
    },
    {
      id: "test",
      feedback: true,
      meta: {
        summary: "Great! You're ready for the real test. Identify the HIGHER pitch."
      },
      ui: {
        showTrialNumber: false // Hide for adaptive staircase
      },
      paradigm: {
        type: "m-AFC",
        intervals: [{ condition: "reference" }, { condition: "target" }],
        randomizeOrder: true,
        timing: { isiMs: 400, itiMs: 1000 }
      },
      stimuli: [{
        type: "multi_component",
        components: [{ frequency: 1000, levelDb: 60, phaseDegrees: 0, ear: "both" }],
        durationMs: 300,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
      }],
      perturbations: [{
        type: "mistuning",
        targetFrequency: 1000,
        deltaPercent: { adaptive: true }
      }],
      adaptive: {
        type: "staircase",
        parameter: "perturbations[0].deltaPercent",
        initialValue: 8,
        stepType: "geometric",
        stepSizes: [1.414, 1.189],
        rule: { correctDown: 2 },
        minValue: 0,
        maxValue: 50,
        unit: "%"
      },
      termination: { reversals: 12 }
    }
  ]
};

/**
 * 2. Intensity Discrimination (Easy Mode)
 * 4I2AFC, 8 Reversals
 */
export const intensityDiscriminationConfig: ExperimentConfigInput = {
  meta: {
    name: "Intensity Discrimination",
    version: "2.2.0",
    summary: "Select the LOUDER tone.",
    description: "You will hear two tones on each trial. Identify which of the tones is louder (1 or 2)."
  },
  ui: {
    showTrialNumber: false, // Hide for adaptive staircase
    showCurrentValue: true,
  },
  blocks: [{
    id: "test",
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [{
      type: "multi_component",
      components: [{ frequency: 1000, levelDb: 60, phaseDegrees: 0, ear: "both" }],
      durationMs: 250,
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
    }],
    perturbations: [{
      type: "gain",
      deltaDb: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaDb",
      initialValue: 4,
      stepType: "geometric",
      stepSizes: [1.414],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 20,
      unit: "dB"
    },
    termination: { reversals: 8 }
  }]
};

/**
 * 3. Tone in Noise (Detection)
 * 2AFC, 8 Reversals
 */
export const toneInNoiseConfig: ExperimentConfigInput = {
  meta: {
    name: "Tone in Noise",
    version: "2.2.0",
    summary: "Select the interval containing the TONE.",
    description: "You will hear two noise bursts, one of which has an additional tone signal embedded within it. Identify the interval containing the tone."
  },
  ui: {
    showTrialNumber: false,
    showCurrentValue: true,
  },
  blocks: [{
    id: "test",
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [
      {
        type: "noise",
        noiseType: "white",
        levelDb: 50,
        durationMs: 400,
        envelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        ear: "both",
        applyTo: "all"
      },
      {
        type: "multi_component",
        components: [{ frequency: 1000, levelDb: 0, phaseDegrees: 0, ear: "both" }],
        durationMs: 400,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        applyTo: "target"
      }
    ],
    perturbations: [{
      type: "gain",
      stimulusIndex: 1,
      deltaDb: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaDb",
      initialValue: 44,
      stepType: "linear",
      stepSizes: [2, 1],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 60,
      unit: "dB"
    },
    termination: { reversals: 8 }
  }]
};

/**
 * 4. AM Detection (Temporal)
 * 2AFC, 8 Reversals
 */
export const amDetectionConfig: ExperimentConfigInput = {
  meta: {
    name: "AM Detection",
    version: "2.2.0",
    summary: "Select the MODULATED (fluttering) sound.",
    description: "One sound is a constant, steady noise. The other has a rhythmic 'flutter' or 'pulsing' where the volume rises and falls. Identify the interval containing this amplitude modulation."
  },
  ui: {
    showTrialNumber: false,
    showCurrentValue: true,
  },
  blocks: [{
    id: "test",
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [
      {
        type: "noise",
        noiseType: "white",
        levelDb: 60,
        durationMs: 400,
        envelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        ear: "both",
        modulators: [{ type: "AM", depth: 0, rateHz: 8 }]
      }
    ],
    perturbations: [{
      type: "am_depth",
      deltaDepth: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaDepth",
      initialValue: 0.5,
      stepType: "geometric",
      stepSizes: [1.414, 1.189],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 1,
      unit: "depth"
    },
    termination: { reversals: 8 }
  }]
};

/**
 * 5. ITD Discrimination (Binaural)
 * 4I2AFC, 12 Reversals
 */
export const itdDiscriminationConfig: ExperimentConfigInput = {
  meta: {
    name: "ITD Discrimination",
    version: "2.2.0",
    summary: "Select the sound shifted to the RIGHT (2 or 3).",
    description: "Four sounds will be presented. The first and last are always centered reference tones. Identify which of the middle two intervals contains the sound shifted toward the right ear."
  },
  ui: {
    showTrialNumber: false,
    showCurrentValue: true,
  },
  blocks: [{
    id: "test",
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [
        { condition: "reference", fixed: true, selectable: false },
        { condition: "reference" },
        { condition: "target" },
        { condition: "reference", fixed: true, selectable: false }
      ],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [{
      type: "multi_component",
      components: [{ frequency: 500, levelDb: 65, phaseDegrees: 0, ear: "both" }],
      durationMs: 400,
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
    }],
    perturbations: [{
      type: "itd",
      mode: "both",
      ear: "left",
      deltaMicroseconds: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaMicroseconds",
      initialValue: 400,
      stepType: "geometric",
      stepSizes: [1.414, 1.189],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 1000,
      unit: "\u03BCs"
    },
    termination: { reversals: 12 }
  }]
};

/**
 * 6. Profile Analysis (Spectral Complexity)
 * 4I2AFC, 12 Reversals
 */
export const profileAnalysisConfig: ExperimentConfigInput = {
  meta: {
    name: "Profile Analysis",
    version: "2.2.0",
    summary: "Select the middle sound (2 or 3) with the different timbre.",
    description: "Four sounds play with random volumes. The first and last are references; identify which of the middle two (2 or 3) has a different 'timbre' or 'color' (the spectral profile)."
  },
  ui: {
    showTrialNumber: false,
    showCurrentValue: true,
  },
  blocks: [{
    id: "test",
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [
        { condition: "reference", fixed: true, selectable: false },
        { condition: "reference" },
        { condition: "target" },
        { condition: "reference", fixed: true, selectable: false }
      ],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [
      {
        type: "multi_component",
        components: [
          { frequency: 200, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 330, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 544, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 898, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 1000, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 1481, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 2442, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 4030, levelDb: 55, phaseDegrees: 0, ear: "both" },
          { frequency: 6650, levelDb: 55, phaseDegrees: 0, ear: "both" }
        ],
        durationMs: 300,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
      },
      {
        type: "multi_component",
        components: [
          { frequency: 1000, levelDb: 55, phaseDegrees: 0, ear: "both" }
        ],
        durationMs: 300,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        applyTo: "target"
      }
    ],
    perturbations: [
      {
        type: "gain",
        applyTo: "all",
        deltaDb: { type: "uniform", min: -8, max: 8 } // Level Rove (applies to both generators)
      },
      // Random phase per component per interval
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 200, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 330, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 544, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 898, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      // Apply same random phase shift to 1000Hz across all intervals
      { type: "phase_shift", targetFrequency: 1000, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 1481, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 2442, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 4030, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 6650, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      {
        type: "gain",
        stimulusIndex: 1, // Target the separate signal component
        applyTo: "target",
        deltaDb: { adaptive: true }
      }
    ],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[10].deltaDb",
      initialValue: 4,
      stepType: "linear",
      stepSizes: [2, 1],
      rule: { correctDown: 2 },
      minValue: -40,
      maxValue: 10,
      unit: "dB (rel)"
    },
    termination: { reversals: 12 }
  }]
};
