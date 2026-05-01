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
        deltaPercent: 15
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
    description: "Four tones will play. The first and last are markers. Which of the middle two (2 or 3) was LOUDER?"
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
      timing: { isiMs: 300, itiMs: 1000 }
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
 * 3AFC, 8 Reversals
 */
export const toneInNoiseConfig: ExperimentConfigInput = {
  meta: {
    name: "Tone in Noise",
    version: "2.2.0",
    summary: "Select the interval containing the TONE.",
    description: "Two intervals contain only noise; one has a hidden tone. Can you hear the beep inside the noise?"
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
        components: [{ frequency: 1000, levelDb: 40, phaseDegrees: 0, ear: "both" }],
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
      initialValue: 10,
      stepType: "linear",
      stepSizes: [4, 2],
      rule: { correctDown: 2 },
      minValue: -30,
      maxValue: 40,
      unit: "dB"
    },
    termination: { reversals: 8 }
  }]
};

/**
 * 4. AM Detection (Temporal)
 * 3AFC, 8 Reversals
 */
export const amDetectionConfig: ExperimentConfigInput = {
  meta: {
    name: "AM Detection",
    version: "2.2.0",
    summary: "Select the FLUCTUATING (wobbly) sound.",
    description: "Listen for the pulsed fluctuation. Two sounds are steady noise; one is 'wobbly' or pulsing."
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
        modulators: [{ type: "AM", depth: 0, sharedEnvelopeId: "mod1" }]
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
      stepSizes: [1.414, 1.2],
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
 * 3AFC, 12 Reversals
 */
export const itdDiscriminationConfig: ExperimentConfigInput = {
  meta: {
    name: "ITD Discrimination",
    version: "2.2.0",
    summary: "Select the sound shifted to the RIGHT.",
    description: "Two sounds are centered; one is shifted toward your right ear. Select the sound shifted to the right."
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
      initialValue: 700,
      stepType: "geometric",
      stepSizes: [1.414, 1.2],
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
 * 3AFC, 12 Reversals
 */
export const profileAnalysisConfig: ExperimentConfigInput = {
  meta: {
    name: "Profile Analysis",
    version: "2.2.0",
    summary: "Select the interval with the DIFFERENT spectral shape.",
    description: "A complex task comparing spectral patterns. Identify the interval where the 'color' of the sound is slightly different."
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
      components: [
        { frequency: 200, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 330, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 544, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 898, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 1000, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 1481, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 2442, levelDb: 55, phaseDegrees: 0, ear: "both" },
        { frequency: 4030, levelDb: 55, phaseDegrees: 0, ear: "both" }
      ],
      durationMs: 300,
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
    }],
    perturbations: [
      {
        type: "gain",
        stimulusIndex: 0,
        applyTo: "all",
        deltaDb: { type: "uniform", min: -8, max: 8 } // Level Rove
      },
      // Random Phase per component per trial
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 200, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 330, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 544, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 898, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 1000, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 1481, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 2442, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      { type: "phase_shift", stimulusIndex: 0, targetFrequency: 4030, applyTo: "all", deltaDegrees: { type: "uniform", min: 0, max: 360 } },
      {
        type: "gain",
        stimulusIndex: 0,
        applyTo: "target",
        deltaDb: { adaptive: true }
      }
    ],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[1].deltaDb",
      initialValue: 12,
      stepType: "linear",
      stepSizes: [4, 2],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 40,
      unit: "dB"
    },
    termination: { reversals: 12 }
  }]
};
