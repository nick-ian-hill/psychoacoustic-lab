import { z } from "zod";

/**
 * Randomization Primitives
 */
export const RandomUniformSchema = z.object({
  random: z.object({
    type: z.literal("uniform"),
    min: z.number(),
    max: z.number(),
  }),
});

export const RandomChoiceSchema = z.object({
  random: z.object({
    type: z.literal("choice"),
    values: z.array(z.any()),
  }),
});

export const AdaptiveParamRefSchema = z.object({
  adaptive: z.literal(true),
});

/**
 * Stimulus Generators
 */
export const EnvelopeSchema = z.object({
  attack: z.number(),
  release: z.number(),
});

export const HarmonicComplexGeneratorSchema = z.object({
  type: z.literal("harmonic_complex"),
  f0: z.number(),
  harmonics: z.object({
    from: z.number(),
    to: z.number(),
  }),
  amplitudeProfile: z.object({
    type: z.enum(["flat", "logarithmic"]),
    levelDb: z.number(),
  }),
  phase: z.enum(["sine", "random"]),
  duration: z.number(),
  envelope: EnvelopeSchema,
});

export const ToneGeneratorSchema = z.object({
  type: z.literal("tone"),
  frequency: z.number().or(RandomUniformSchema).or(RandomChoiceSchema),
  levelDb: z.number(),
  duration: z.number(),
  envelope: EnvelopeSchema,
});

export const ComponentSchema = z.object({
  frequency: z.number(),
  levelDb: z.number(),
  phase: z.number().optional().default(0), // radians
});

export const ComponentComplexGeneratorSchema = z.object({
  type: z.literal("component_complex"),
  components: z.array(ComponentSchema),
  duration: z.number(),
  envelope: EnvelopeSchema,
});

export const LogSpacedComplexGeneratorSchema = z.object({
  type: z.literal("log_spaced_complex"),
  fromFreq: z.number(),
  toFreq: z.number(),
  numComponents: z.number(),
  levelDbTotal: z.number(),
  duration: z.number(),
  envelope: EnvelopeSchema,
});

export const StimulusGeneratorSchema = z.union([
  ToneGeneratorSchema,
  HarmonicComplexGeneratorSchema,
  ComponentComplexGeneratorSchema,
  LogSpacedComplexGeneratorSchema,
]);

/**
 * Perturbations
 */
export const SpectralProfilePerturbationSchema = z.object({
  type: z.literal("spectral_profile"),
  targetHarmonic: z.number().or(RandomChoiceSchema),
  deltaDb: z.number().or(AdaptiveParamRefSchema).or(RandomUniformSchema),
});

export const AsynchronyPerturbationSchema = z.object({
  type: z.literal("onset_asynchrony"),
  targetHarmonic: z.number().or(RandomChoiceSchema),
  delayMs: z.number().or(AdaptiveParamRefSchema),
});

export const MistuningPerturbationSchema = z.object({
  type: z.literal("mistuning"),
  targetHarmonic: z.number().or(RandomChoiceSchema),
  deltaPercent: z.number().or(AdaptiveParamRefSchema),
});

export const PerturbationSchema = z.union([
  SpectralProfilePerturbationSchema,
  AsynchronyPerturbationSchema,
  MistuningPerturbationSchema,
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
    isi: z.number(), // Inter-stimulus interval in ms
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
  initialN: z.number().optional().default(1), // Fast start
  switchReversalCount: z.number().optional().default(2), // When to switch from initialN to rule.correctDown
  minValue: z.number(),
  maxValue: z.number(),
  reversals: z.number(),
});

/**
 * Config
 */
export const ExperimentConfigSchema = z.object({
  meta: z.object({
    name: z.string(),
    version: z.string(),
    seed: z.number(),
    rationale: z.string().optional(),
    literature_references: z.array(z.string()).optional(),
    advisor_warnings: z.array(z.string()).optional(),
  }),
  audio: z.object({
    sampleRate: z.number().default(44100),
  }),
  stimulus: StimulusGeneratorSchema,
  perturbations: z.array(PerturbationSchema).optional(),
  conditions: z.object({
    reference: z.any(), // Usually just empty or base
    target: z.any(),
  }),
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
export type Paradigm = z.infer<typeof ParadigmSchema>;
export type AdaptiveConfig = z.infer<typeof AdaptiveConfigSchema>;
