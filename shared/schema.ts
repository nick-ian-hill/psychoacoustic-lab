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
});

export const StimulusGeneratorSchema = z.union([
  MultiComponentGeneratorSchema,
  NoiseGeneratorSchema,
]);

/**
 * Perturbations
 */
export const SpectralProfilePerturbationSchema = z.object({
  type: z.literal("spectral_profile"),
  targetFrequency: z.number(),
  deltaDb: z.union([z.number(), AdaptiveParamRefSchema, RandomUniformSchema]),
});

export const AsynchronyPerturbationSchema = z.object({
  type: z.literal("onset_asynchrony"),
  targetFrequency: z.number(),
  delayMs: z.union([z.number(), AdaptiveParamRefSchema]),
});

export const MistuningPerturbationSchema = z.object({
  type: z.literal("mistuning"),
  targetFrequency: z.number(),
  deltaPercent: z.union([z.number(), AdaptiveParamRefSchema]),
});

export const PhaseShiftPerturbationSchema = z.object({
  type: z.literal("phase_shift"),
  targetFrequency: z.number(),
  deltaDegrees: z.union([z.number(), AdaptiveParamRefSchema]),
});

export const AMDepthPerturbationSchema = z.object({
  type: z.literal("am_depth"),
  targetFrequency: z.number().optional(), // optional if applying to broadband noise
  deltaDepth: z.union([z.number(), AdaptiveParamRefSchema]),
});

export const PerturbationSchema = z.union([
  SpectralProfilePerturbationSchema,
  AsynchronyPerturbationSchema,
  MistuningPerturbationSchema,
  PhaseShiftPerturbationSchema,
  AMDepthPerturbationSchema,
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
    correctDown: z.number(),
    incorrectUp: z.number(),
  }),
  initialN: z.number().optional(),
  switchReversalCount: z.number().optional(),
  minValue: z.number(),
  maxValue: z.number(),
  reversals: z.number(),
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
    seed: z.number(),
    rationale: z.string().optional(),
    instructions: z.string().optional(),
    literature_references: z.array(z.string()).optional(),
    advisor_warnings: z.array(z.string()).optional(),
  }),
  audio: z.object({
    sampleRate: z.number().default(44100),
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
  termination: z.object({
    maxTrials: z.number().optional(),
    reversals: z.number().optional(),
  }),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;
export type StimulusGenerator = z.infer<typeof StimulusGeneratorSchema>;
export type Perturbation = z.infer<typeof PerturbationSchema>;
export type AdaptiveParamRef = z.infer<typeof AdaptiveParamRefSchema>;
