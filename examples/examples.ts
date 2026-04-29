import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Intensity Discrimination
 */
export const intensityDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "Intensity Discrimination",
    version: "1.0.0",
    seed: 123,
    summary: "Select the LOUDER tone.",
    description: "Two tones will play in sequence. Which was LOUDER? Press 1 or 2."
  },
  ui: {
    showCurrentValue: true,
    showTrialNumber: true,
  },
  blocks: [{
    id: "test",
    trials: 40,
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
      durationMs: 300,
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
    }],
    perturbations: [{
      type: "gain",
      deltaDb: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaDb",
      initialValue: 6,
      stepType: "geometric",
      stepSizes: [2, 1.5, 1.2],
      stepSizeInterval: 2,
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 20,
      unit: "dB"
    },
    termination: { reversals: 12 }
  }]
};

/**
 * 2. Practice then Test (Multi-Block Demo)
 */
export const practiceTestConfig: ExperimentConfig = {
  meta: {
    name: "Practice & Test Demo",
    version: "2.0.0",
    seed: 777,
    summary: "Select the HIGHER pitched tone.",
    description: "Identify the interval with the higher pitch. This demo includes a fixed-level practice stage followed by an adaptive test."
  },
  blocks: [
    {
      id: "practice",
      trials: 5,
      feedback: true,
      meta: { summary: "PRACTICE: Level is FIXED. Get 5 correct to advance." },
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
        deltaPercent: 10
      }],
      termination: { correctTrials: 5 }
    },
    {
      id: "test",
      trials: 50,
      feedback: true,
      meta: { summary: "TEST: Level is now ADAPTIVE. Good luck!" },
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
        initialValue: 5,
        stepType: "geometric",
        stepSizes: [2, 1.414, 1.189],
        stepSizeInterval: 2,
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
 * 3. ITD Discrimination
 */
export const itdDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "ITD Discrimination",
    version: "2.0.0",
    seed: 888,
    summary: "Select the interval shifted to the RIGHT.",
    description: "Listen for the sound shifting toward your right ear. Two intervals are centered; one is shifted by delaying the LEFT ear."
  },
  blocks: [{
    id: "test",
    trials: 40,
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 500, itiMs: 1000 }
    },
    stimuli: [{
      type: "multi_component",
      components: [{ frequency: 500, levelDb: 70, phaseDegrees: 0, ear: "both" }],
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
      stepSizes: [1.2, 1.189],
      stepSizeInterval: 2,
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 1000,
      unit: "\u03BCs"
    },
    termination: { reversals: 12 }
  }]
};

/**
 * 4. AM Detection (Shared Envelopes Demo)
 */
export const amDetectionConfig: ExperimentConfig = {
  meta: {
    name: "AM Detection",
    version: "2.0.0",
    seed: 654,
    summary: "Select the FLUCTUATING interval.",
    description: "Listen for a 'wah-wah' pulsing sound. One interval is steady; the other fluctuates."
  },
  blocks: [{
    id: "test",
    trials: 40,
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 500, itiMs: 1000 }
    },
    stimuli: [
      {
        type: "noise",
        noiseType: "white",
        levelDb: 60,
        durationMs: 500,
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
      initialValue: 0.3,
      stepType: "geometric",
      stepSizes: [1.414, 1.122, 1.059],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 1,
      unit: "depth"
    },
    termination: { reversals: 12 }
  }]
};

/**
 * 5. Profile Analysis (Spectral Shape & Level Roving)
 */
export const profileAnalysisConfig: ExperimentConfig = {
  meta: {
    name: "Profile Analysis",
    version: "2.0.0",
    seed: 101,
    summary: "Select the interval with the DIFFERENT spectral shape.",
    description: "A complex of 11 tones. In the target, the center tone (1000 Hz) is increased in level. All tones are roved together in level to ensure you can't use absolute loudness cues."
  },
  blocks: [{
    id: "test",
    trials: 50,
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 400, itiMs: 1000 }
    },
    stimuli: [{
      type: "multi_component",
      components: [
        { frequency: 200, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 330, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 544, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 898, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 1000, levelDb: 60, phaseDegrees: 0, ear: "both" }, // Target component
        { frequency: 1481, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 2442, levelDb: 60, phaseDegrees: 0, ear: "both" },
        { frequency: 4030, levelDb: 60, phaseDegrees: 0, ear: "both" }
      ],
      durationMs: 300,
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" }
    }],
    perturbations: [
      {
        type: "gain",
        targetGeneratorIndex: 0,
        applyTo: "all",
        deltaDb: { type: "uniform", min: -10, max: 10 } // Global Rove
      },
      {
        type: "gain",
        targetGeneratorIndex: 0,
        applyTo: "target",
        deltaDb: { adaptive: true } // Increment target component level
      }
    ],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[1].deltaDb",
      initialValue: 12,
      stepType: "linear",
      stepSizes: [4, 2, 1],
      rule: { correctDown: 2 },
      minValue: 0,
      maxValue: 40,
      unit: "dB"
    },
    termination: { reversals: 12 }
  }]
};

/**
 * 6. Tone in Noise (Detection Threshold)
 */
export const toneInNoiseConfig: ExperimentConfig = {
  meta: {
    name: "Tone in Noise",
    version: "2.0.0",
    seed: 555,
    summary: "Select the interval containing the TONE.",
    description: "A 1000 Hz tone is hidden inside white noise. Can you hear it?"
  },
  blocks: [{
    id: "test",
    trials: 40,
    feedback: true,
    paradigm: {
      type: "m-AFC",
      intervals: [{ condition: "reference" }, { condition: "target" }],
      randomizeOrder: true,
      timing: { isiMs: 500, itiMs: 1000 }
    },
    stimuli: [
      {
        type: "noise",
        noiseType: "white",
        levelDb: 50,
        durationMs: 500,
        envelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        ear: "both",
        applyTo: "all"
      },
      {
        type: "multi_component",
        components: [{ frequency: 1000, levelDb: 40, phaseDegrees: 0, ear: "both" }],
        durationMs: 500,
        globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
        applyTo: "target"
      }
    ],
    perturbations: [{
      type: "gain",
      targetGeneratorIndex: 1, // Target the tone generator
      deltaDb: { adaptive: true }
    }],
    adaptive: {
      type: "staircase",
      parameter: "perturbations[0].deltaDb",
      initialValue: 10,
      stepType: "linear",
      stepSizes: [4, 2, 1],
      rule: { correctDown: 2 },
      minValue: -20,
      maxValue: 40,
      unit: "dB"
    },
    termination: { reversals: 12 }
  }]
};
