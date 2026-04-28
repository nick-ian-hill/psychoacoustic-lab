import { z } from "zod";

/**
 * Randomization & Adaptive Primitives
 */
export const RandomUniformSchema = z.object({
  type: z.literal("uniform"),
  min: z.number(),
  max: z.number(),
});

export const RandomChoiceSchema = z.object({
  type: z.literal("choice"),
  values: z.array(z.any()),
});

export const AdaptiveParamRefSchema = z.object({
  adaptive: z.literal(true),
});

export const EarRoutingSchema = z.enum(["left", "right", "both"]);
export type EarRouting = z.infer<typeof EarRoutingSchema>;

/**
 * Stimulus Generators
 */
export const EnvelopeSchema = z.object({
  attackMs: z.number(),
  releaseMs: z.number(),
  type: z.enum(["linear", "cosine"]).optional(),
});

export const ModulatorSchema = z.object({
  type: z.enum(["AM", "FM"]),
  rateHz: z.number(),
  depth: z.number(), // 0 to 1 for AM, or Hz deviation for FM
  phaseDegrees: z.number().optional(),
});

export const StimulusComponentSchema = z.object({
  frequency: z.number(),
  levelDb: z.number(),
  phaseDegrees: z.number().optional().describe("Fine-structure phase shift (use for IPD)."),
  onsetDelayMs: z.number().optional().describe("Whole-stimulus temporal offset (use for ITD)."),
  ear: EarRoutingSchema.optional(),
  modulators: z.array(ModulatorSchema).optional(),
});

export type StimulusComponent = z.infer<typeof StimulusComponentSchema>;

export const MultiComponentGeneratorSchema = z.object({
  type: z.literal("multi_component"),
  components: z.array(StimulusComponentSchema),
  durationMs: z.number(),
  globalEnvelope: EnvelopeSchema,
  applyTo: z.enum(["target", "all", "reference"]).optional().describe("Whether this generator applies to only the target interval, reference intervals, or all intervals."),
});

export const NoiseGeneratorSchema = z.object({
  type: z.literal("noise"),
  noiseType: z.enum(["white", "pink", "brown"]),
  bandLimit: z.object({
    lowFreq: z.number(),
    highFreq: z.number(),
  }).optional(),
  levelDb: z.number(),
  durationMs: z.number(),
  envelope: EnvelopeSchema,
  ear: EarRoutingSchema.optional(),
  modulators: z.array(ModulatorSchema).optional(),
  onsetDelayMs: z.number().optional().describe("Temporal offset in milliseconds."),
  applyTo: z.enum(["target", "all", "reference"]).optional().describe("Whether this generator applies to only the target interval, reference intervals, or all intervals."),
});

export const StimulusGeneratorSchema = z.union([
  MultiComponentGeneratorSchema,
  NoiseGeneratorSchema,
]);

/**
 * Perturbations
 */
export const BasePerturbationSchema = z.object({
  applyTo: z.enum(["target", "all"]).optional().describe("Whether this perturbation applies only to the target interval (default) or all intervals (useful for roving)."),
  targetGeneratorIndex: z.number().int().optional().describe("Optional: Target a specific generator by its index in the stimuli array. If omitted, applies to all matching generators."),
});

export const SpectralProfilePerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("spectral_profile"),
  targetFrequency: z.number(),
  deltaDb: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
});

export const AsynchronyPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("onset_asynchrony"),
  targetFrequency: z.number().optional(),
  delayMs: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
});

export const MistuningPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("mistuning"),
  targetFrequency: z.number().optional().describe("If omitted, applies to all components in the stimulus (Global Pitch Roving)."),
  deltaPercent: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
});

export const PhaseShiftPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("phase_shift"),
  targetFrequency: z.number().optional(), // optional if applying to broadband noise
  deltaDegrees: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
  ear: z.enum(["left", "right", "both"]).optional(),
});

export const AMDepthPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("am_depth"),
  targetFrequency: z.number().optional(), // optional if applying to broadband noise
  deltaDepth: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
});

export const GainPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("gain"),
  deltaDb: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
  ear: z.enum(["left", "right", "both"]).optional().describe("Optional: target only one ear for dichotic level roving."),
});

export const ITDPerturbationSchema = BasePerturbationSchema.extend({
  type: z.literal("itd"),
  targetFrequency: z.number().optional().describe("For fine-structure ITD, which frequency component to shift. If omitted, applies to all components (broadband ITD)."),
  deltaMicroseconds: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
  mode: z.enum(["fine_structure", "envelope", "both"]).default("both")
    .describe("fine_structure: shift phase only; envelope: shift onset only; both: shift both."),
  ear: z.enum(["left", "right"]).default("right").describe("Which ear to delay/shift. Delaying the right ear moves the sound to the left."),
});

export const PerturbationSchema = z.union([
  SpectralProfilePerturbationSchema,
  AsynchronyPerturbationSchema,
  MistuningPerturbationSchema,
  PhaseShiftPerturbationSchema,
  AMDepthPerturbationSchema,
  GainPerturbationSchema,
  ITDPerturbationSchema,
]);

/**
 * Paradigm
 */
export const ParadigmSchema = z.object({
  type: z.enum(["2AFC", "3AFC", "Probe-Signal"]),
  intervals: z.array(z.object({
    condition: z.enum(["reference", "target", "probe"]),
  })),
  randomizeOrder: z.boolean(),
  timing: z.object({
    isiMs: z.number(),
    itiMs: z.number().min(50).default(1000).describe("Inter-trial interval in milliseconds (min 50ms). The next trial always starts automatically after this interval."),
    feedbackDurationMs: z.number().default(400).optional().describe("Duration in milliseconds for which the feedback (correct/incorrect) is displayed after a response."),
    responseDelayMs: z.number().min(0).default(250).optional().describe("Delay between the end of stimulus presentation and enabling the response buttons."),
    allowReplay: z.boolean().optional().describe("If true, the user can replay the stimulus before responding."),
  }),
});

/**
 * Adaptive Logic
 */
export const AdaptiveConfigSchema = z.object({
  type: z.literal("staircase"),
  parameter: z.string(), // e.g. "perturbations[0].deltaDb"
  initialValue: z.number(),
  stepSizes: z.array(z.number()),
  rule: z.object({
    correctDown: z.number().int(),
  }),
  initialN: z.number().int().optional(),
  switchReversalCount: z.number().int().optional(),
  stepType: z.enum(["linear", "geometric"]).default("linear").optional(),
  stepSizeInterval: z.number().int().default(1).optional(),
  minValue: z.number(),
  maxValue: z.number(),
  reversals: z.number().optional().describe("Deprecated: use termination.reversals instead. Kept for MCP validator compatibility."),
  unit: z.string().optional().describe("The unit of the adaptive parameter (e.g., 'Hz', 'dB', '%', '°')."),
});

export const CalibrationPointSchema = z.object({
  frequency: z.number(),
  offsetDb: z.number(),
});

export const CalibrationProfileSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  points: z.array(CalibrationPointSchema),
});

export type CalibrationProfile = z.infer<typeof CalibrationProfileSchema>;

/**
 * Final Experiment Configuration
 */
export const ExperimentConfigSchema = z.object({
  meta: z.object({
    name: z.string(),
    version: z.string(),
    seed: z.number().int(),
    rationale: z.string().optional(),
    summary: z.string().optional().describe("A short summary (max 150 chars) shown during the experiment.").refine(s => !s || s.length <= 150, "Summary must be 150 characters or less."),
    description: z.string().optional().describe("A detailed description shown on the selection screen and in the help popup."),

    literature_references: z.array(z.string()).optional(),
    advisor_warnings: z.array(z.string()).optional(),
  }),

  audio: z.object({
    sampleRate: z.number().int().default(44100),
  }),
  calibration: CalibrationProfileSchema.optional(),
  globalLevelDb: z.number().optional(),
  stimuli: z.array(StimulusGeneratorSchema),
  perturbations: z.array(PerturbationSchema).optional(),
  conditions: z.object({
    reference: z.any().optional(),
    target: z.any().optional(),
  }).optional(),
  paradigm: ParadigmSchema,
  adaptive: AdaptiveConfigSchema.optional(),
  ui: z.object({
    showInstructions: z.boolean().default(true),
    showTrialNumber: z.boolean().default(true),
    showReversals: z.boolean().default(true),
    showCurrentValue: z.boolean().default(false),
    showAverageThreshold: z.boolean().default(false),
  }).partial().default({
    showInstructions: true,
    showTrialNumber: true,
    showReversals: true,
    showCurrentValue: false,
    showAverageThreshold: false,
  }).optional(),
  termination: z.object({
    maxTrials: z.number().int().optional(),
    reversals: z.number().int().optional(),
    discardReversals: z.number().int().optional().describe("Number of initial reversals to discard when calculating the final threshold. Defaults to 4."),
  }),
}).superRefine((data, ctx) => {
  const hasAdaptivePerturbation = data.perturbations?.some(p => {
    // Check all possible adaptive fields in perturbations
    const pAny = p as any;
    const val = pAny.deltaDb || pAny.deltaPercent || pAny.deltaMicroseconds || pAny.delayMs || pAny.deltaDegrees || pAny.deltaDepth;
    return val && typeof val === 'object' && val.adaptive === true;
  });

  if (hasAdaptivePerturbation && !data.adaptive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "One or more perturbations are set to { adaptive: true }, but no 'adaptive' block is defined.",
      path: ["adaptive"],
    });
  }

  if (!hasAdaptivePerturbation && data.adaptive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An 'adaptive' block is defined, but no perturbation is hooked up to it (none have { adaptive: true }).",
      path: ["adaptive"],
    });
  }
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;
export type StimulusGenerator = z.infer<typeof StimulusGeneratorSchema>;
export type Perturbation = z.infer<typeof PerturbationSchema>;
export type AdaptiveParamRef = z.infer<typeof AdaptiveParamRefSchema>;
export type AdaptiveConfig = z.infer<typeof AdaptiveConfigSchema>;
