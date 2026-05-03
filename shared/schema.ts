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
  rateHz: z.number().optional().describe("Rate in Hz. For AM/FM, this defines the sine-wave frequency. If sharedEnvelopeId is provided, this value is used as the bandwidth for the random noise envelope."),
  depth: z.number(), // 0 to 1 for AM, or Hz deviation for FM
  phaseDegrees: z.number().optional(),
  sharedEnvelopeId: z.string().optional().describe("ID of a shared, noise-based modulation envelope. All modulators sharing this ID will be perfectly correlated (comodulated)."),
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

export const FilteredNoiseGeneratorSchema = z.object({
  type: z.literal("filtered_noise"),
  firCoefficients: z.array(z.number()),
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
  FilteredNoiseGeneratorSchema,
]);

/**
 * Perturbations
 */
export const BasePerturbationSchema = z.object({
  applyTo: z.enum(["target", "all"]).optional().describe("Whether this perturbation applies only to the target interval (default) or all intervals (useful for roving)."),
  stimulusIndex: z.number().int().optional().describe("Optional: Target a specific generator by its index in the stimuli array. If omitted, applies to all matching generators."),
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
export const IntervalSchema = z.object({
  condition: z.enum(["reference", "target", "probe"]),
  fixed: z.boolean().optional().describe("If true, this interval's position is never randomized, even if randomizeOrder is true. Use for lead-in/lead-out cues."),
  selectable: z.boolean().optional().default(true).describe("If false, this interval acts only as a marker/cue and cannot be selected as a response. The UI will disable or hide the corresponding button."),
  perturbations: z.array(PerturbationSchema).optional().describe("Interval-specific perturbations (e.g. fixed pedestal shift)."),
});

export type Interval = z.infer<typeof IntervalSchema>;

export const ParadigmSchema = z.object({
  type: z.enum(["2AFC", "3AFC", "m-AFC", "Probe-Signal"]),
  intervals: z.array(IntervalSchema),
  targetPerturbation: PerturbationSchema.optional().describe("The perturbation that distinguishes the target interval from references."),
  randomizeOrder: z.boolean(),
    timing: z.object({
      isiMs: z.number().min(20).default(400).describe("Inter-stimulus interval in milliseconds (min 20ms)."),
      itiMs: z.number().min(50).default(1000).describe("Inter-trial interval in milliseconds (min 50ms)."),
      feedbackDurationMs: z.number().min(0).default(400).optional().describe("Duration in milliseconds for which feedback is displayed."),
      responseDelayMs: z.number().min(0).default(250).optional().describe("Delay before enabling response buttons."),
      readyDelayMs: z.number().min(50).default(500).optional().describe("Delay between clicking 'Start' and first stimulus (min 50ms)."),
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
 * Block Schema
 */
export const BlockSchema = z.object({
  type: z.literal("block").optional().default("block"),
  id: z.string(),
  repetitions: z.number().int().min(1).default(1).optional(),
  feedback: z.boolean().default(true),
  meta: z.object({
    summary: z.string().optional(),
    description: z.string().optional(),
    seed: z.number().int().optional(),
  }).optional(),
  paradigm: ParadigmSchema,
  stimuli: z.array(StimulusGeneratorSchema),
  perturbations: z.array(PerturbationSchema).optional(),
  adaptive: AdaptiveConfigSchema.optional(),
  ui: z.object({
    showInstructions: z.boolean().default(true),
    showTrialNumber: z.boolean().default(true),
    showReversals: z.boolean().default(false),
    showCurrentValue: z.boolean().default(false),
    showAverageThreshold: z.boolean().default(false),
  }).partial().optional(),
  termination: z.object({
    trials: z.number().int().optional().describe("Stop the block after exactly N trials (or as a ceiling for adaptive tasks)."),
    reversals: z.number().int().optional().describe("Stop the block after N reversals in the adaptive staircase."),
    correctTrials: z.number().int().optional().describe("Stop the block after N correct trials (useful for practice/onboarding)."),
    discardReversals: z.number().int().optional().describe("Number of initial reversals to discard when calculating threshold. Defaults to 4."),
  }).optional(),
}).superRefine((data, ctx) => {
  const hasAdaptivePerturbation = data.perturbations?.some(p => {
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

export type BlockEntry = BlockConfig | {
  type: "group";
  id: string;
  randomize?: boolean;
  repetitions?: number;
  blocks: BlockEntry[];
};

export const BlockEntrySchema: z.ZodType<BlockEntry> = z.lazy(() => 
  z.union([
    BlockSchema,
    z.object({
      type: z.literal("group"),
      id: z.string(),
      randomize: z.boolean().default(false).optional(),
      repetitions: z.number().int().min(1).default(1).optional(),
      blocks: z.array(BlockEntrySchema),
    })
  ])
);

/**
 * Final Experiment Configuration
 */
export const ExperimentConfigSchema = z.object({
  meta: z.object({
    name: z.string(),
    version: z.string(),
    seed: z.number().int().optional(),
    rationale: z.string().optional(),
    summary: z.string().describe("A short summary (max 150 chars) shown during the experiment.").refine(s => s.length <= 150, "Summary must be 150 characters or less."),
    description: z.string().describe("A detailed description shown on the selection screen and in the help popup."),
    literature_references: z.array(z.string()).optional(),
    advisor_warnings: z.array(z.string()).optional(),
    autoSave: z.boolean().default(false).optional().describe("If true, results are automatically backed up to local storage after each block."),
  }),
  calibration: CalibrationProfileSchema.optional(),
  globalLevelDb: z.number().optional(),
  ui: z.object({
    showInstructions: z.boolean().default(true),
    showTrialNumber: z.boolean().default(true),
    showReversals: z.boolean().default(false),
    showCurrentValue: z.boolean().default(false),
    showAverageThreshold: z.boolean().default(false),
  }).partial().optional(),
  blocks: z.array(BlockEntrySchema),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;
export type ExperimentConfigInput = z.input<typeof ExperimentConfigSchema>;
export type BlockConfig = z.infer<typeof BlockSchema>;
export type StimulusGenerator = z.infer<typeof StimulusGeneratorSchema>;
export type Perturbation = z.infer<typeof PerturbationSchema>;
export type AdaptiveParamRef = z.infer<typeof AdaptiveParamRefSchema>;
export type AdaptiveConfig = z.infer<typeof AdaptiveConfigSchema>;

