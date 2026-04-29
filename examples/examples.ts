import type { ExperimentConfig } from "../shared/schema.js";

/**
 * 1. Basic Frequency Discrimination
 */
export const freqDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "Frequency Discrimination",
    version: "2.0.0",
    seed: 123,
    summary: "Select the HIGHER pitched tone.",
    description: "Two tones will play in sequence. Which was HIGHER? Press 1 or 2."
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
      globalEnvelope: { attackMs: 10, releaseMs: 10, type: "linear" }
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
        globalEnvelope: { attackMs: 10, releaseMs: 10, type: "linear" }
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
        globalEnvelope: { attackMs: 10, releaseMs: 10, type: "linear" }
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
 * 3. ITD/IPD Discrimination
 */
export const itdDiscrimConfig: ExperimentConfig = {
  meta: {
    name: "ITD/IPD Discrimination",
    version: "2.0.0",
    seed: 888,
    summary: "Select the interval shifted to the RIGHT.",
    description: "Listen for the sound shifting toward your right ear. Two intervals are centered; one is shifted."
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
      globalEnvelope: { attackMs: 20, releaseMs: 20 }
    }],
    perturbations: [{
      type: "itd",
      mode: "fine_structure",
      ear: "right",
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
    name: "AM Detection (Shared)",
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
        envelope: { attackMs: 20, releaseMs: 20 },
        ear: "right",
        modulators: [{ type: "AM", depth: 0, sharedEnvelopeId: "mod1" }]
      },
      {
        type: "noise",
        noiseType: "white",
        levelDb: 60,
        durationMs: 500,
        envelope: { attackMs: 20, releaseMs: 20 },
        ear: "right",
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
