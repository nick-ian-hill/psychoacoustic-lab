import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ExperimentConfigSchema,
} from "../../shared/schema.js";

// Minimal seeded PRNG (Mulberry32) — no external dependency required.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PsychoacousticServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "psychoacousticlab",
        version: "2.0.0",
      },

      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "list_examples",
          description: "List the names of all included classic and modern psychoacoustic experiment examples. USE THIS before designing custom paradigms to see established patterns and ensure your configuration aligns with standard practices.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_example_config",
          description: "Retrieve and view the full JSON configuration for a specific example. Use this to understand how the ExperimentConfig schema is applied in practice or to review existing paradigms.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name of the example (e.g., 'freqDiscrim', 'srim')" }
            },
            required: ["name"]
          }
        },
        {
          name: "get_schema_reference",
          description: "Return annotated documentation for the full ExperimentConfig schema — all fields, types, and usage notes. Use this before building a new experiment to understand what fields are available, and strictly validate your proposed configurations against these rules.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "calc_frequencies",
          description: "[Tier 3: Primitive] Calculate frequency components. GUARDRAIL: Use 'erb' spacing for experiments involving human auditory filter models. Use 'log' for musical pitch or general spectral spacing. Use 'linear' for harmonic complexes.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["linear", "log", "erb"] },
              minFreq: { type: "number", minimum: 20, maximum: 20000 },
              maxFreq: { type: "number", minimum: 20, maximum: 20000 },
              numComponents: { type: "integer", minimum: 1, maximum: 100 }
            },
            required: ["type", "minFreq", "maxFreq", "numComponents"]
          }
        },
        {
          name: "calc_phases",
          description: "[Tier 3: Primitive] Calculate starting phases for components in DEGREES. GUARDRAIL: Use 'random' phases (with a seed) to prevent unintended phase-coherence cues or high peak-to-average power ratios, unless specifically testing phase effects. Use 'schroeder' for specific masker temporal properties.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["sine", "random", "schroeder_positive", "schroeder_negative"] },
              numComponents: { type: "integer", minimum: 1, maximum: 100 },
              seed: { type: "integer", description: "Required for 'random' type — ensures reproducibility. Use meta.seed from your ExperimentConfig." }
            },
            required: ["type", "numComponents"],
            if: { properties: { type: { const: "random" } } },
            then: { required: ["seed"] }
          }
        },
        {
          name: "calc_amplitudes",
          description: "[Tier 3: Primitive] Calculate component levels in dB SPL. GUARDRAIL: Use 'pink_noise_tilt' to achieve equal energy per auditory band, often required for uniform masking across frequencies.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["flat", "pink_noise_tilt"] },
              baseLevelDb: { type: "number", minimum: 0, maximum: 100, description: "Overall level or starting level" },
              numComponents: { type: "integer", minimum: 1, maximum: 100 },
              frequencies: {
                type: "array",
                items: { type: "number", minimum: 20, maximum: 20000 },
                description: "Required for 'pink_noise_tilt' — provide the frequency array from calc_frequencies for an accurate 3dB/octave roll-off."
              }
            },
            required: ["type", "baseLevelDb", "numComponents"]
          }
        },
        {
          name: "calc_itd",
          description: "[Tier 3: Primitive] Convert an Interaural Time Difference (ITD) in microseconds to the onsetDelayMs and phase values needed by the engine. Positive values always represent a DELAY (lag), which shifts the sound AWAY from the targeted ear. GUARDRAIL: Essential for BMLD and lateralisation experiments. Pay attention to phase ambiguity: humans cannot resolve fine-structure ITD/IPD above ~1000-1400 Hz.",
          inputSchema: {
            type: "object",
            properties: {
              itdMicroseconds: { type: "number", minimum: -5000, maximum: 5000, description: "The desired ITD in microseconds (e.g. 700 for a natural lateralised source)" },
              frequencyHz: { type: "number", minimum: 20, maximum: 20000, description: "Optional: the stimulus frequency in Hz. If provided, computes the equivalent IPD in degrees." },
              sampleRate: { type: "integer", minimum: 8000, maximum: 192000, description: "Optional: sample rate (default 44100). Used to compute exact sample count." }
            },
            required: ["itdMicroseconds"]
          }
        },
        {
          name: "calc_ild",
          description: "[Tier 3: Primitive] Calculate Interaural Level Difference (ILD) offsets for left and right ears. ILD is a primary cue for sound lateralization, especially at high frequencies (>1500 Hz).",
          inputSchema: {
            type: "object",
            properties: {
              ildDb: { type: "number", minimum: -40, maximum: 40, description: "Desired ILD in dB. Positive values shift the sound to the right (Right > Left)." },
              baseLevelDb: { type: "number", minimum: 0, maximum: 100, description: "The reference level in dB SPL. Defaults to 70." },
              strategy: {
                type: "string",
                enum: ["center", "left_fixed", "right_fixed"],
                description: "center: distributes ILD around baseLevel; left_fixed: keeps left at baseLevel; right_fixed: keeps right at baseLevel."
              }
            },
            required: ["ildDb"]
          }
        },
        {
          name: "evaluate_and_finalize_experiment",
          description: "Final validation and expert review of an ExperimentConfig. MANDATORY FINAL STEP: You MUST pass this validation before presenting the final JSON to the user. It checks for clipping risks, adaptive staircase stability, and other common experimental design errors.",
          inputSchema: {
            type: "object",
            properties: {
              config: { type: "object" }
            },
            required: ["config"]
          }
        },
        {
          name: "generate_harmonic_complex",
          description: "[Tier 2: Component Generator] Generate a harmonic complex stimulus. Outputs a 'multi_component' generator object. All DSP math is performed based on the provided sampleRate.",
          inputSchema: {
            type: "object",
            properties: {
              f0: { type: "number", minimum: 20, maximum: 5000, description: "Fundamental frequency in Hz." },
              numHarmonics: { type: "integer", minimum: 1, maximum: 100 },
              spectralTiltDbPerOctave: { type: "number", description: "Amplitude roll-off (e.g., -6 for 6dB/octave tilt)." },
              startingPhase: { type: "string", enum: ["sine", "random", "schroeder_positive", "schroeder_negative"] },
              durationMs: { type: "integer", minimum: 10, maximum: 5000 },
              levelDb: { type: "number", minimum: 0, maximum: 100, description: "Level of the fundamental component (dB SPL)." },
              sampleRate: { type: "integer", default: 44100 },
              seed: { type: "integer", description: "Required for 'random' phases." }
            },
            required: ["f0", "numHarmonics", "durationMs", "levelDb"]
          }
        },
        {
          name: "generate_notched_noise",
          description: "[Tier 2: Component Generator] Generate FIR coefficients for a notched noise masker approximating a roex(p, r) filter shape. All DSP math is performed based on the provided sampleRate.",
          inputSchema: {
            type: "object",
            properties: {
              centerFreq: { type: "number", minimum: 100, maximum: 10000 },
              notchWidthHz: { type: "number", minimum: 0 },
              p: { type: "number", description: "Slope parameter p (steepness)." },
              r: { type: "number", description: "Dynamic range parameter r (limit)." },
              filterOrder: { type: "integer", enum: [511, 1023], default: 511 },
              sampleRate: { type: "integer", default: 44100 }
            },
            required: ["centerFreq", "notchWidthHz", "p", "r"]
          }
        },
        {
          name: "calc_bmld_config",
          description: "[Tier 2: Component Generator] Calculate configuration for Binaural Masking Level Difference (BMLD) experiments (e.g., N0Spi).",
          inputSchema: {
            type: "object",
            properties: {
              preset: { type: "string", enum: ["N0S0", "N0Spi", "NpiS0", "NuSpi"] },
              signalFreq: { type: "number" },
              signalLevelDb: { type: "number" },
              noiseLevelDb: { type: "number" },
              durationMs: { type: "number" },
              sampleRate: { type: "integer", default: 44100 }
            },
            required: ["preset", "signalFreq", "signalLevelDb", "noiseLevelDb", "durationMs"]
          }
        },
        {
          name: "generate_config_from_template",
          description: "[Tier 1: Orchestrator] Create a valid ExperimentConfig by providing high-level parameters to a known paradigm template. Use this to quickly bootstrap an experiment without manual JSON construction.",
          inputSchema: {
            type: "object",
            properties: {
              templateName: { type: "string", enum: ["intensityDiscrim", "practiceTest", "itdDiscrim", "amDetection", "profileAnalysis", "toneInNoise"], description: "The base paradigm to use." },
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Custom name for the experiment." },
                  rationale: { type: "string", description: "Scientific rationale for the experiment design." },
                  summary: { type: "string", description: "A short, user-facing summary (max 150 chars) shown during the experiment." },
                  description: { type: "string", description: "A detailed description shown on the selection screen and in the help popup." },
                  frequencyHz: { type: "number", minimum: 20, maximum: 20000, description: "Override the primary frequency (Hz)." },
                  levelDb: { type: "number", minimum: 0, maximum: 100, description: "Override the base presentation level (dB SPL)." },
                  durationMs: { type: "number", minimum: 10, maximum: 5000, description: "Override stimulus duration (ms)." },
                  adaptiveInitialValue: { type: "number", description: "Initial value for the adaptive staircase." },
                  adaptiveStepSizes: { type: "array", items: { type: "number" }, description: "Array of step sizes for the staircase." }
                }
              }
            },
            required: ["templateName"]
          }
        },
        {
          name: "generate_batch_configs",
          description: "[Tier 1: Orchestrator] Generate a set of ExperimentConfigs by applying a list of variations to a base configuration. Essential for multi-condition studies (e.g. comparing thresholds across frequencies).",
          inputSchema: {
            type: "object",
            properties: {
              baseConfig: { type: "object", description: "The template ExperimentConfig JSON." },
              variations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    conditionName: { type: "string", description: "Suffix for the experiment name (e.g. '500Hz')." },
                    overrides: { type: "object", description: "Partial ExperimentConfig to merge (e.g. { stimuli: [...], meta: { ... } })." }
                  },
                  required: ["conditionName", "overrides"]
                }
              }
            },
            required: ["baseConfig", "variations"]
          }
        },
        {
          name: "generate_stimulus_block",
          description: "[Tier 2: Component Generator] Takes high-level parameters and returns a fully formed multi_component or noise generator object. Benefit: Prevents array length mismatches and ensures schema compliance.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["multi_component", "noise"] },
              durationMs: { type: "integer", minimum: 10, maximum: 5000 },
              ear: { type: "string", enum: ["left", "right", "both"] },
              applyTo: { type: "string", enum: ["target", "all", "reference"] },
              envelope: {
                type: "object",
                properties: {
                  attackMs: { type: "integer", minimum: 0 },
                  releaseMs: { type: "integer", minimum: 0 },
                  type: { type: "string", enum: ["linear", "cosine"] }
                },
                required: ["attackMs", "releaseMs"]
              },
              numComponents: { type: "integer", minimum: 1, maximum: 100 },
              minFreq: { type: "number", minimum: 20, maximum: 20000 },
              maxFreq: { type: "number", minimum: 20, maximum: 20000 },
              freqSpacing: { type: "string", enum: ["linear", "log", "erb"] },
              phaseType: { type: "string", enum: ["sine", "random", "schroeder_positive", "schroeder_negative"] },
              levelType: { type: "string", enum: ["flat", "pink_noise_tilt"] },
              baseLevelDb: { type: "number", minimum: 0, maximum: 100 },
              seed: { type: "integer" },
              noiseType: { type: "string", enum: ["white", "pink", "brown"] },
              bandLimit: {
                type: "object",
                properties: {
                  lowFreq: { type: "number", minimum: 20, maximum: 20000 },
                  highFreq: { type: "number", minimum: 20, maximum: 20000 }
                }
              }
            },
            required: ["type", "durationMs"],
            if: { properties: { phaseType: { const: "random" } } },
            then: { required: ["seed"] }
          }
        },
        {
          name: "summarize_experiment",
          description: "Provide a scientific and technical summary of an ExperimentConfig. Use this to explain the methodology to a user or verify a design.",
          inputSchema: {
            type: "object",
            properties: {
              config: { type: "object" }
            },
            required: ["config"]
          }
        }
      ],
    }));


    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "list_examples":
          return {
            content: [{
              type: "text",
              // MAINTENANCE NOTE: Update this list whenever a new export is added to examples/examples.ts
              text: "Available Examples: intensityDiscrim, practiceTest, itdDiscrim, amDetection, profileAnalysis, toneInNoise"
            }]
          };

        case "get_example_config":
          return this.handleGetExample(request.params.arguments);
        case "get_schema_reference":
          return this.handleGetSchemaReference();
        case "calc_frequencies":
          return this.handleCalcFrequencies(request.params.arguments);
        case "calc_phases":
          return this.handleCalcPhases(request.params.arguments);
        case "calc_amplitudes":
          return this.handleCalcAmplitudes(request.params.arguments);
        case "calc_itd":
          return this.handleCalcItd(request.params.arguments);
        case "calc_ild":
          return this.handleCalcIld(request.params.arguments);
        case "generate_stimulus_block":
          return this.handleGenerateStimulusBlock(request.params.arguments);
        case "evaluate_and_finalize_experiment":
          return this.handleFinalize(request.params.arguments);
        case "generate_harmonic_complex":
          return this.handleGenerateHarmonicComplex(request.params.arguments);
        case "generate_notched_noise":
          return this.handleGenerateNotchedNoise(request.params.arguments);
        case "calc_bmld_config":
          return this.handleCalcBmld(request.params.arguments);
        case "generate_config_from_template":
          return this.handleGenerateFromTemplate(request.params.arguments);
        case "generate_batch_configs":
          return this.handleGenerateBatch(request.params.arguments);
        case "summarize_experiment":
          return this.handleSummarize(request.params.arguments);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  private handleGetSchemaReference() {
    const reference = `
# ExperimentConfig Schema Reference

## meta (required)
- name: string — Experiment name (shown in UI and download filenames)
- version: string — Semantic version string
- seed: number — Master RNG seed; used for noise generation AND interval-order randomization
- rationale?: string — Scientific rationale
- summary: string (required) — A short summary (max 150 chars) shown during the experiment
- description: string (required) — A detailed description shown on the selection screen and in the help popup
- literature_references?: string[] — Citation list
- advisor_warnings?: string[] — Custom warnings to surface in experiment design


## calibration? (optional)
- id: string
- description?: string
- points: Array<{ frequency: number; offsetDb: number }> — Log-interpolated offsets.

## globalLevelDb? (optional, number)
A linear gain applied to the entire rendered trial buffer (after synthesis, before normalization).
Use to scale the overall presentation level without changing relative component levels.

## stimuli (required, array of generators)
Each generator is one of:

### multi_component generator
- type: "multi_component"
- durationMs: number
- globalEnvelope: { attackMs, releaseMs }
- components: Array of StimulusComponent:
  - frequency: number (Hz)
  - levelDb: number (dB SPL)
  - phaseDegrees?: number — fine-structure phase (use for static IPD)
  - onsetDelayMs?: number — whole-stimulus temporal shift (use for ITD)
  - ear?: "left" | "right" | "both" (default "both")
  - modulators?: Array<{ type: "AM"|"FM", rateHz, depth, phaseDegrees? }>
  - applyTo?: "target" | "all" | "reference" (default "all") — Whether this generator plays in the target, reference, or all intervals.

### noise generator
- type: "noise"
- noiseType: "white" | "pink" | "brown"
- bandLimit?: { lowFreq, highFreq } — brick-wall band limiting
- levelDb: number
- durationMs: number
- envelope: { attackMs, releaseMs, type?: "linear" | "cosine" } — Default is "cosine" (Raised Cosine) for laboratory-grade precision.
- ear?: "left" | "right" | "both"
- modulators?: Array<{ type: "AM", rateHz, depth }>
- applyTo?: "target" | "all" | "reference" (default "all")

## perturbations? (optional, array)
By default, perturbations apply only to the 'target' interval.
- applyTo: "target" | "all" — Set to "all" for ROVING (randomization across all intervals).

### Value Types (used for deltaDb, deltaPercent, etc.)
- number — Static value.
- { adaptive: true } — Links to the mandatory 'adaptive' staircase block.
- { type: "uniform", min: number, max: number } — ROVING: Randomized per interval/trial using meta.seed.

### Types:
#### gain
- deltaDb: number | { adaptive: true } | RandomUniform
- applyTo: "all" — Use this for GLOBAL LEVEL ROVING (e.g., +/- 5 dB).

#### spectral_profile
- targetFrequency: number
- deltaDb: value
- applyTo: "all" — Use for INDIVIDUAL COMPONENT ROVING.

#### mistuning
- targetFrequency?: number — If omitted, shifts all frequencies (GLOBAL PITCH ROVING).
- deltaPercent: value

#### onset_asynchrony
- targetFrequency: number
- delayMs: value

#### phase_shift
- targetFrequency: number
- ear?: "left" | "right" | "both"
- deltaDegrees: value

#### am_depth
- targetFrequency?: number
- deltaDepth: value

#### itd
- deltaMicroseconds: value (Positive = Delay/Lag; shifts sound AWAY from targeted ear)
- mode: "fine_structure" | "envelope" | "both" (default "both")
- ear: "left" | "right" (default "right") — The ear to be delayed.
- targetFrequency?: number — (Optional) target a specific component.

## paradigm (required)
- type: "2AFC" | "3AFC" | "m-AFC" | "Probe-Signal"
- intervals: Array<{ condition: "reference" | "target" | "probe", fixed?: boolean, selectable?: boolean }> — Set 'fixed: true' to lock an interval's position. Set 'selectable: false' (default true) to mark an interval as a non-clickable cue/anchor.
- randomizeOrder: boolean — uses meta.seed for reproducibility
- timing:
  - isiMs: number — inter-stimulus interval
  - itiMs: number — inter-trial interval (default 1000ms); next trial always starts automatically after this interval
  - feedbackDurationMs: number — duration for which correct/incorrect feedback is displayed (default 400ms)
  - responseDelayMs: number — delay between end of stimulus and enabling response buttons (default 250ms)
  - readyDelayMs: number — delay between clicking 'Start' and the first stimulus onset (default 500ms)
  - allowReplay?: boolean — if true, participant can re-listen before responding

## adaptive? (optional)
- type: "staircase"
- parameter: string — e.g., "perturbations[0].deltaDb" (Required; serves as a human-readable link to the field using { "adaptive": true })
- initialValue: number
- stepSizes: number[] — step sizes; later entries used after each reversal
- stepType?: "linear" | "geometric" — Defaults to linear. Use 'geometric' for variables bounded by zero (multiplies/divides step sizes).
- stepSizeInterval?: number — Number of reversals required before advancing to the next step size in the stepSizes array. Defaults to 1. WARNING: Setting this to N means the step size only advances every N reversals. If stepSizes has fewer entries than (totalReversals / N), the final step size will be held for the remainder — which may be intentional but is a common misconfiguration.
- rule: { correctDown: number } — e.g., { correctDown: 3 } for 3-down/1-up
- initialN?: number — fast-start: use N-down/1-up until switchReversalCount reversals
- switchReversalCount?: number — reversal count at which fast-start ends
- minValue: number
- maxValue: number
- unit?: string — The display unit of the adaptive parameter (e.g., 'Hz', 'dB', '%', '°'). Shown in the UI status badge and included in the downloaded results JSON. Always set this for labelled threshold output.

## conditions? (optional)
A free-form object with 'reference' and/or 'target' keys. Currently used as a metadata carrier for documenting per-condition parameter overrides in the config file. The engine itself does not read this field — all condition differences must be expressed via perturbations.
- reference?: any — Optional descriptor for what the reference interval represents.
- target?: any — Optional descriptor for what the target interval represents.

## ui? (optional)
Partial object. All fields are optional and fall back to defaults if omitted.
- showInstructions: boolean — Default true.
- showTrialNumber: boolean — Default true.
- showReversals: boolean — Default false.
- showCurrentValue: boolean — Default false.
- showAverageThreshold: boolean — Default false.

## termination (required)
- reversals?: number — stop after N reversals (threshold averaged from reversal values, discarding first 4 by default)
- trials?: number — stop after exactly N trials (or as a safety ceiling for adaptive tasks)
- correctTrials?: number — stop after N correct trials (useful for onboarding/practice)
- discardReversals?: number — number of initial reversals to discard when calculating threshold. Defaults to 4.
`;
    return { content: [{ type: "text", text: reference }] };
  }

  private internalCalcFrequencies(type: "linear" | "log" | "erb", minFreq: number, maxFreq: number, numComponents: number): number[] {
    const freqs: number[] = [];
    if (numComponents === 1) return [minFreq];

    if (type === "linear") {
      const step = (maxFreq - minFreq) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(minFreq + i * step);
    } else if (type === "log") {
      const logStart = Math.log10(minFreq);
      const logEnd = Math.log10(maxFreq);
      const step = (logEnd - logStart) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(Math.pow(10, logStart + i * step));
    } else if (type === "erb") {
      const hzToErb = (hz: number) => 21.4 * Math.log10(4.37 * (hz / 1000) + 1);
      const erbToHz = (erb: number) => ((Math.pow(10, erb / 21.4) - 1) / 4.37) * 1000;
      const startErb = hzToErb(minFreq);
      const endErb = hzToErb(maxFreq);
      const step = (endErb - startErb) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(erbToHz(startErb + i * step));
    }
    return freqs.map(f => parseFloat(f.toFixed(3)));
  }

  private internalCalcPhases(type: "sine" | "random" | "schroeder_positive" | "schroeder_negative", numComponents: number, seed?: number): number[] {
    const phases: number[] = [];
    if (type === "sine") {
      for (let i = 0; i < numComponents; i++) phases.push(0);
    } else if (type === "random") {
      if (seed === undefined) throw new Error("A 'seed' is required for random phases.");
      const rng = mulberry32(seed);
      for (let i = 0; i < numComponents; i++) phases.push(rng() * 360);
    } else if (type.startsWith("schroeder")) {
      const sign = type === "schroeder_positive" ? 1 : -1;
      for (let k = 1; k <= numComponents; k++) {
        const rad = sign * Math.PI * k * (k - 1) / numComponents;
        phases.push((rad * 180 / Math.PI) % 360);
      }
    }
    return phases.map(p => parseFloat(p.toFixed(2)));
  }

  private internalCalcAmplitudes(type: "flat" | "pink_noise_tilt", baseLevelDb: number, numComponents: number, frequencies?: number[]): number[] {
    const levels: number[] = [];
    if (type === "flat") {
      for (let i = 0; i < numComponents; i++) levels.push(baseLevelDb);
    } else if (type === "pink_noise_tilt") {
      if (frequencies && frequencies.length === numComponents) {
        const f0 = frequencies[0];
        for (let i = 0; i < numComponents; i++) {
          const octaves = Math.log2(frequencies[i] / f0);
          levels.push(baseLevelDb - 3 * octaves);
        }
      } else {
        for (let i = 0; i < numComponents; i++) {
          levels.push(baseLevelDb - 10 * Math.log10(i + 1));
        }
      }
    }
    return levels.map(l => parseFloat(l.toFixed(2)));
  }

  private handleCalcFrequencies(args: any) {
    const { type, minFreq, maxFreq, numComponents } = args;
    try {
      const freqs = this.internalCalcFrequencies(type, minFreq, maxFreq, numComponents);
      return { content: [{ type: "text", text: JSON.stringify(freqs) }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  }

  private handleCalcPhases(args: any) {
    const { type, numComponents, seed } = args;
    try {
      const phases = this.internalCalcPhases(type, numComponents, seed);
      return { content: [{ type: "text", text: JSON.stringify(phases) }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  }

  private handleCalcAmplitudes(args: any) {
    const { type, baseLevelDb, numComponents, frequencies } = args;
    const levels = this.internalCalcAmplitudes(type, baseLevelDb, numComponents, frequencies);
    let warning = "";
    if (type === "pink_noise_tilt" && (!frequencies || frequencies.length !== numComponents)) {
      warning = "\n\nNOTE: For accurate 3dB/octave pink tilt, provide a 'frequencies' array. The result uses an index-based approximation.";
    }
    return { content: [{ type: "text", text: JSON.stringify(levels) + warning }] };
  }

  private handleGenerateStimulusBlock(args: any) {
    const {
      type, durationMs, ear, applyTo, envelope,
      numComponents, minFreq, maxFreq, freqSpacing,
      phaseType, levelType, baseLevelDb, seed,
      noiseType, bandLimit
    } = args;

    if (type === "multi_component") {
      try {
        const freqs = this.internalCalcFrequencies(freqSpacing || "linear", minFreq || 1000, maxFreq || 1000, numComponents || 1);
        const phases = this.internalCalcPhases(phaseType || "sine", numComponents || 1, seed);
        const levels = this.internalCalcAmplitudes(levelType || "flat", baseLevelDb || 70, numComponents || 1, freqs);

        const components = freqs.map((f, i) => ({
          frequency: f,
          phaseDegrees: phases[i],
          levelDb: levels[i],
          ear: ear || "both"
        }));

        const generator: any = {
          type: "multi_component",
          durationMs,
          components,
          globalEnvelope: envelope || { attackMs: 10, releaseMs: 10, type: "cosine" }
        };
        if (applyTo) generator.applyTo = applyTo;

        return { content: [{ type: "text", text: JSON.stringify(generator, null, 2) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: `Error generating multi_component: ${e.message}` }] };
      }
    } else {
      const generator: any = {
        type: "noise",
        noiseType: noiseType || "white",
        levelDb: baseLevelDb || 70,
        durationMs,
        envelope: envelope || { attackMs: 10, releaseMs: 10, type: "cosine" }
      };
      if (ear) generator.ear = ear;
      if (applyTo) generator.applyTo = applyTo;
      if (bandLimit) generator.bandLimit = bandLimit;

      return { content: [{ type: "text", text: JSON.stringify(generator, null, 2) }] };
    }
  }

  private handleGenerateHarmonicComplex(args: any) {
    const { f0, numHarmonics, spectralTiltDbPerOctave = 0, startingPhase, durationMs, levelDb, sampleRate = 44100, seed } = args;
    const frequencies: number[] = [];
    for (let k = 1; k <= numHarmonics; k++) {
      const f = f0 * k;
      if (f < sampleRate / 2) frequencies.push(f);
    }
    const levels = frequencies.map(f => levelDb + spectralTiltDbPerOctave * Math.log2(f / f0));
    const phases = this.internalCalcPhases(startingPhase || "sine", frequencies.length, seed);

    const components = frequencies.map((f, i) => ({
      frequency: parseFloat(f.toFixed(2)),
      levelDb: parseFloat(levels[i].toFixed(2)),
      phaseDegrees: phases[i]
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          type: "multi_component",
          durationMs,
          components,
          globalEnvelope: { attackMs: 10, releaseMs: 10, type: "cosine" }
        }, null, 2)
      }]
    };
  }

  private handleGenerateNotchedNoise(args: any) {
    const { centerFreq, notchWidthHz, p, r, filterOrder = 511, sampleRate = 44100 } = args;
    const N = filterOrder + 1;
    const coeffs = new Float32Array(N);
    const halfN = N / 2;

    const getRoex = (f: number) => {
      const g = Math.abs(f - centerFreq) / centerFreq;
      if (Math.abs(f - centerFreq) < notchWidthHz / 2) return 0;
      return (1 - r) * (1 + p * g) * Math.exp(-p * g) + r;
    };

    const mag = new Float32Array(halfN + 1);
    for (let i = 0; i <= halfN; i++) {
      const f = (i / halfN) * (sampleRate / 2);
      mag[i] = getRoex(f);
    }

    for (let n = 0; n < N; n++) {
      let sum = mag[0];
      for (let k = 1; k < halfN; k++) {
        const theta = (2 * Math.PI * k * (n - halfN)) / N;
        sum += 2 * mag[k] * Math.cos(theta);
      }
      sum += mag[halfN] * Math.cos(Math.PI * (n - halfN));
      coeffs[n] = sum / N;
    }

    for (let n = 0; n < N; n++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
      coeffs[n] *= w;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          type: "filtered_noise",
          levelDb: 70,
          durationMs: 500,
          envelope: { attackMs: 10, releaseMs: 10, type: "cosine" },
          firCoefficients: Array.from(coeffs).map(c => parseFloat(c.toFixed(6)))
        }, null, 2)
      }]
    };
  }

  private handleCalcBmld(args: any) {
    const { preset, signalFreq, signalLevelDb, noiseLevelDb, durationMs } = args;
    const stimuli: any[] = [];
    const perturbations: any[] = [];

    const noiseGen = {
      type: "noise",
      noiseType: "white",
      levelDb: noiseLevelDb,
      durationMs,
      envelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
      ear: "both"
    };

    const signalGen = {
      type: "multi_component",
      durationMs,
      components: [
        { frequency: signalFreq, levelDb: signalLevelDb, ear: "both" }
      ],
      globalEnvelope: { attackMs: 20, releaseMs: 20, type: "cosine" },
      applyTo: "target"
    };

    stimuli.push(noiseGen, signalGen);

    if (preset === "N0Spi") {
      perturbations.push({
        type: "phase_shift",
        targetFrequency: signalFreq,
        ear: "right",
        deltaDegrees: 180,
        applyTo: "target"
      });
    } else if (preset === "NuSpi") {
      (noiseGen as any).ear = "left";
      stimuli.push({ ...noiseGen, ear: "right" });
      perturbations.push({
        type: "phase_shift",
        targetFrequency: signalFreq,
        ear: "right",
        deltaDegrees: 180,
        applyTo: "target"
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ stimuli, perturbations }, null, 2)
      }]
    };
  }

  private handleCalcItd(args: any) {
    const { itdMicroseconds, frequencyHz, sampleRate = 44100 } = args;
    const itdMs = itdMicroseconds / 1000;
    const itdSamples = Math.round((itdMicroseconds / 1e6) * sampleRate);

    let ipdDegrees: number | null = null;
    let ipdWarning = "";
    if (frequencyHz !== undefined) {
      ipdDegrees = (itdMicroseconds / 1e6) * frequencyHz * 360;
      if (ipdDegrees > 180) {
        ipdWarning = `WARNING: IPD of ${ipdDegrees.toFixed(1)}° exceeds 180° at ${frequencyHz} Hz. This creates a phase ambiguity — the auditory system cannot resolve ITDs above ~750 µs for low frequencies. Consider using a shorter ITD or a lower frequency.`;
      }
    }

    const result: any = {
      itdMicroseconds,
      onsetDelayMs: parseFloat(itdMs.toFixed(4)),
      samplesAt44100: Math.round((itdMicroseconds / 1e6) * 44100),
      ...(sampleRate !== 44100 ? { [`samplesAt${sampleRate}`]: itdSamples } : {}),
      usage: "In a perturbation of type 'itd', set deltaMicroseconds to this value and target the LAGGING ear. The leading ear remains at 0.",
    };

    if (ipdDegrees !== null) {
      result.equivalentIpdDegrees = parseFloat(ipdDegrees.toFixed(2));
    }
    if (ipdWarning) result.warning = ipdWarning;

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleCalcIld(args: any) {
    const { ildDb, baseLevelDb = 70, strategy = "center" } = args;
    let leftLevel = baseLevelDb;
    let rightLevel = baseLevelDb;

    if (strategy === "center") {
      leftLevel = baseLevelDb - (ildDb / 2);
      rightLevel = baseLevelDb + (ildDb / 2);
    } else if (strategy === "left_fixed") {
      leftLevel = baseLevelDb;
      rightLevel = baseLevelDb + ildDb;
    } else if (strategy === "right_fixed") {
      rightLevel = baseLevelDb;
      leftLevel = baseLevelDb - ildDb;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          leftLevelDb: parseFloat(leftLevel.toFixed(2)),
          rightLevelDb: parseFloat(rightLevel.toFixed(2)),
          actualIldDb: parseFloat((rightLevel - leftLevel).toFixed(2))
        }, null, 2)
      }]
    };
  }

  private handleFinalize(args: any) {
    const result = ExperimentConfigSchema.safeParse(args.config);
    if (!result.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify(result.error.format(), null, 2) }] };
    }
    const config = result.data;
    const warnings: string[] = [];
    const sampleRate = 44100;

    config.blocks.forEach((block, blockIdx) => {
      const calculatePeakPower = (condition: "target" | "reference") => {
        let totalPowerL = 0;
        let totalPowerR = 0;

        const getPerturbationMaxDb = (targetFreq: number | undefined, type: string) => {
          let maxDb = 0;
          if (!block.perturbations) return 0;
          for (const p of block.perturbations) {
            if (p.type === type && (!targetFreq || (p as any).targetFrequency === targetFreq)) {
              const val = (p as any).deltaDb;
              if (typeof val === 'number') maxDb += val;
              else if (val?.adaptive) maxDb += block.adaptive?.maxValue || 0;
              else if (val?.type === 'uniform') maxDb += val.max;
            }
          }
          return maxDb;
        };

        const globalPertDb = getPerturbationMaxDb(undefined, 'gain');

        for (const gen of block.stimuli) {
          const genApplyTo = (gen as any).applyTo || "all";
          if (genApplyTo !== "all" && genApplyTo !== condition) continue;

          if (gen.type === "multi_component") {
            for (const c of gen.components as any[]) {
              const pDb = c.levelDb + getPerturbationMaxDb(c.frequency, 'spectral_profile') + globalPertDb;
              const p = Math.pow(10, pDb / 10);
              if (c.ear === "left") { totalPowerL += p; }
              else if (c.ear === "right") { totalPowerR += p; }
              else { totalPowerL += p; totalPowerR += p; }
            }
          } else if (gen.type === "noise" || gen.type === "filtered_noise") {
            const pDb = gen.levelDb + getPerturbationMaxDb(undefined, 'spectral_profile') + globalPertDb;
            const p = Math.pow(10, pDb / 10);
            if (gen.ear === "left") { totalPowerL += p; }
            else if (gen.ear === "right") { totalPowerR += p; }
            else { totalPowerL += p; totalPowerR += p; }
          }
        }

        if (config.globalLevelDb !== undefined) {
          const globalLinear = Math.pow(10, config.globalLevelDb / 10);
          totalPowerL *= globalLinear;
          totalPowerR *= globalLinear;
        }
        return Math.max(totalPowerL, totalPowerR);
      };

      const peakChannelPower = Math.max(calculatePeakPower("target"), calculatePeakPower("reference"));
      if (peakChannelPower > 0) {
        const totalDb = 10 * Math.log10(peakChannelPower);
        if (totalDb > 95) {
          warnings.push(`Block ${blockIdx} (${block.id}): CLIPPING RISK: Worst-case peak level exceeds 95 dB SPL (Estimated: ${totalDb.toFixed(1)} dB).`);
        }
      }

      if (block.adaptive && (block.termination?.reversals ?? 0) < 10) {
        warnings.push(`Block ${blockIdx} (${block.id}): STABILITY WARNING: Adaptive staircase reversals are below 10.`);
      }

      // Path resolution check
      if (block.adaptive) {
        const path = block.adaptive.parameter;
        const existsInStimuli = block.stimuli.some((_, i) => path.startsWith(`stimuli[${i}]`));
        const existsInPerturbations = block.perturbations?.some((_, i) => path.startsWith(`perturbations[${i}]`));
        if (!existsInStimuli && !existsInPerturbations) {
          warnings.push(`Block ${blockIdx} (${block.id}): INVALID PATH: Adaptive parameter '${path}' does not resolve to an existing stimulus or perturbation.`);
        }
      }

      // Nyquist check
      block.stimuli.forEach(gen => {
        if (gen.type === 'multi_component') {
          gen.components.forEach(comp => {
            if (comp.frequency >= sampleRate / 2) {
              warnings.push(`Block ${blockIdx} (${block.id}): NYQUIST VIOLATION: Frequency ${comp.frequency}Hz exceeds ${sampleRate / 2}Hz.`);
            }
          });
        }
      });
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          validatedConfig: config,
          expertReview: {
            status: warnings.length > 0 ? "REVIEW_REQUIRED" : "APPROVED",
            warnings
          }
        }, null, 2)
      }]
    };
  }

  private async handleGetExample(args: any) {
    const { name } = args;
    try {
      const examples = await import("../../examples/examples.js");
      // Try both raw name and name + "Config"
      const config = (examples as any)[name] || (examples as any)[`${name}Config`];

      if (!config) {
        throw new Error(`Example '${name}' not found. Available: intensityDiscrim, practiceTest, itdDiscrim, amDetection, profileAnalysis, toneInNoise`);
      }
      return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error loading example: ${e.message}` }], isError: true };
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const val = source[key];
      if (val !== null && typeof val === "object" && !Array.isArray(val) && key in target && typeof target[key] === "object") {
        result[key] = this.deepMerge(target[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  private async handleGenerateFromTemplate(args: any) {
    const { templateName, parameters = {} } = args;
    try {
      const examples = await import("../../examples/examples.js");
      const baseConfig = (examples as any)[templateName] || (examples as any)[`${templateName}Config`];
      if (!baseConfig) throw new Error(`Template '${templateName}' not found.`);

      let config = JSON.parse(JSON.stringify(baseConfig));

      if (parameters.name) config.meta.name = parameters.name;
      if (parameters.rationale) config.meta.rationale = parameters.rationale;
      if (parameters.summary) config.meta.summary = parameters.summary;
      if (parameters.description) config.meta.description = parameters.description;

      // Map parameters to the first block for simplicity in template generation
      const block = config.blocks[0];

      if (parameters.frequencyHz !== undefined) {
        block.stimuli.forEach((s: any) => {
          if (s.type === 'multi_component') {
            s.components.forEach((c: any) => {
              if (c.frequency === 1000 || s.components.length === 1) c.frequency = parameters.frequencyHz;
            });
          }
        });
        block.perturbations?.forEach((p: any) => {
          if ('targetFrequency' in p && (p.targetFrequency === 1000 || p.targetFrequency === undefined)) {
            p.targetFrequency = parameters.frequencyHz;
          }
        });
      }

      if (parameters.levelDb !== undefined) {
        block.stimuli.forEach((s: any) => {
          s.levelDb = parameters.levelDb;
          if (s.components) s.components.forEach((c: any) => c.levelDb = parameters.levelDb);
        });
      }

      if (parameters.durationMs !== undefined) {
        block.stimuli.forEach((s: any) => s.durationMs = parameters.durationMs);
      }

      if (parameters.adaptiveInitialValue !== undefined && block.adaptive) {
        block.adaptive.initialValue = parameters.adaptiveInitialValue;
      }

      if (parameters.adaptiveStepSizes !== undefined && block.adaptive) {
        block.adaptive.stepSizes = parameters.adaptiveStepSizes;
      }

      return this.handleFinalize({ config });
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error generating from template: ${e.message}` }], isError: true };
    }
  }

  private handleGenerateBatch(args: any) {
    const { baseConfig, variations } = args;
    const configs = variations.map((v: any) => {
      let config = JSON.parse(JSON.stringify(baseConfig));
      config = this.deepMerge(config, v.overrides);
      config.meta.name = `${config.meta.name} (${v.conditionName})`;
      return config;
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          batchSize: configs.length,
          configs
        }, null, 2)
      }]
    };
  }

  private handleSummarize(args: any) {
    const result = ExperimentConfigSchema.safeParse(args.config);
    if (!result.success) return { isError: true, content: [{ type: "text", text: "Invalid Config" }] };
    const config = result.data;

    let summary = `
# Experiment Summary: ${config.meta.name}
**Rationale**: ${config.meta.rationale || "N/A"}
**Total Blocks**: ${config.blocks.length}

`;

    config.blocks.forEach((block, i) => {
      summary += `## Block ${i + 1}: ${block.id}\n`;
      summary += `**Paradigm**: ${block.paradigm.type}\n`;
      summary += `### Stimuli\n`;
      block.stimuli.forEach((s, j) => {
        const applyToStr = (s as any).applyTo && (s as any).applyTo !== "all" ? ` [${(s as any).applyTo}]` : "";
        if (s.type === 'multi_component') {
          summary += `- Generator ${j + 1}: Multi-component (${s.components.length} tones), ${s.durationMs}ms${applyToStr}\n`;
        } else if (s.type === 'noise') {
          summary += `- Generator ${j + 1}: ${(s as any).noiseType} noise, ${s.durationMs}ms${applyToStr}\n`;
        } else if (s.type === 'filtered_noise') {
          summary += `- Generator ${j + 1}: Filtered noise (FIR), ${s.durationMs}ms${applyToStr}\n`;
        }
      });
      summary += `### Logic\n`;
      summary += `**Adaptive**: ${block.adaptive ? `Yes (${block.adaptive.rule.correctDown}-down/1-up on ${block.adaptive.parameter})` : "No"}\n`;
      const term = block.termination;
      const termConditions = [];
      if (term?.reversals) termConditions.push(`${term.reversals} reversals`);
      if (term?.trials) termConditions.push(`${term.trials} trials`);
      if (term?.correctTrials) termConditions.push(`${term.correctTrials} correct trials`);
      summary += `**Termination**: ${termConditions.join(" OR ") || "N/A"}\n\n`;
    });

    return { content: [{ type: "text", text: summary }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Psychoacoustic Math Toolkit Server running");
  }
}

const server = new PsychoacousticServer();
server.run();
