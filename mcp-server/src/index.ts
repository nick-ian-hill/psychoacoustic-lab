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
          name: "about_toolkit",
          description: "MANDATORY START: You MUST call this tool before designing a NEW experiment or generating a configuration. BEHAVIORAL RULES: 1) Act as a rigorous scientific collaborator. 2) Identify confounds. 3) Ask about secondary parameters. 4) STOP: You are strictly forbidden from generating a final JSON 'ExperimentConfig' for a new experiment until the user approves your plain-text plan. (Note: These restrictions do NOT apply to general repository analysis, debugging, or research tasks).",
          inputSchema: { type: "object", properties: {} }
        },
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
          description: "[Tier 3: Primitive] Convert an Interaural Time Difference (ITD) in microseconds to the onsetDelayMs value needed by the engine, and compute the equivalent Interaural Phase Difference (IPD). GUARDRAIL: Essential for BMLD and lateralisation experiments. Pay attention to phase ambiguity: humans cannot resolve fine-structure ITD/IPD above ~1000-1400 Hz due to a loss of phase-locking.",
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
          name: "generate_config_from_template",
          description: "[Tier 1: Orchestrator] Create a valid ExperimentConfig by providing high-level parameters to a known paradigm template. Use this to quickly bootstrap an experiment without manual JSON construction.",
          inputSchema: {
            type: "object",
            properties: {
              templateName: { type: "string", enum: ["freqDiscrim", "itdDiscrim", "amDetection", "profileAnalysis", "tenTest", "srim"], description: "The base paradigm to use." },
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Custom name for the experiment." },
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
        case "about_toolkit":
          return {
            content: [{
              type: "text",
              text: `BEHAVIORAL RULES & MANDATORY WORKFLOW:
- SCIENTIFIC COLLABORATION: Act as a rigorous scientific collaborator, not just a code generator.
- CONFOUND CONTROL: Before proposing a design, actively identify and discuss how to control for confounding cues (e.g., controlling absolute energy cues in a profile analysis task by roving the global level).
- PARAMETER ELICITATION: Do not assume secondary parameters (e.g., stimulus duration, interstimulus interval, inter-trial interval, response delay interval, number of reversals). Explicitly ask the user for their preferences.
- LITERATURE SEARCH: Perform a web search to validate chosen parameters.
- STEP-BY-STEP APPROVAL: For NEW experiment designs, propose a plain-text plan first.
- CONFIG GENERATION LIMIT: You are strictly forbidden from generating a final JSON 'ExperimentConfig' for a NEW design until the user approves the text plan. This restriction does NOT apply to repo analysis, debugging, or viewing existing examples.
- WORKFLOW SCOPE: If the user's request is research-oriented (e.g., 'Review the examples'), proceed with your analysis autonomously without being blocked by 'STOP' directives meant for configuration generation.

ARCHITECTURE & BINAURAL PRECISION:
- Smart Server / Dumb Engine: The Audio Engine only renders explicit components. It does not auto-generate complex stimulus relationships.
- TIERED TOOLING & ABSTRACTION:
  * TIER 1: Orchestrators (e.g., generate_config_from_template, generate_batch_configs) — Use these to build entire experiments or condition batches in one shot.
  * TIER 2: Component Generators (e.g., generate_stimulus_block) — The RECOMMENDED way to build custom stimuli safely. It handles internal math and ensures schema compliance.
  * TIER 3: Primitives (e.g., calc_frequencies, calc_phases, calc_itd) — Low-level math utilities for manual overrides and precise component-level targeting.
- Stimulus Construction: Prefer Tier 2 tools over Tier 3 primitives unless you need granular control over individual frequency/phase/level arrays.
- IPD (Interaural Phase Difference): Use the high-level 'itd' perturbation with mode: 'fine_structure'. This handles frequency-to-phase conversion automatically.
- True ITD (Interaural Time Difference): Use the high-level 'itd' perturbation with mode: 'both' or 'envelope'.
- Adaptive Linking (MANDATORY): If you use { "adaptive": true } in any perturbation, you MUST also define an 'adaptive' configuration block. Conversely, if you define an 'adaptive' block, at least one perturbation MUST be set to { "adaptive": true }.
- Finalization: Use evaluate_and_finalize_experiment as your final step to check for clipping risks and adaptive stability.

HUMAN AUDITORY THRESHOLDS (EMPIRICAL YARDSTICKS):
To prevent hallucinating arbitrary parameters, base your initial values and boundaries on these human limits:
- Absolute Detection: Human sensitivity peaks in the mid-range (1000 to 4000 Hz), where thresholds can approach 0 dB SPL.
- Frequency Discrimination: Human pitch acuity is exceptionally fine. The pure-tone Just Noticeable Difference (JND) is roughly 0.16% of the base frequency in the mid-frequency range. Expressed as a Weber fraction: \\frac{\\Delta f}{f} \\approx 0.0016. For example, the JND for a 2000 Hz tone is approximately 3.2 Hz.
- Intensity Discrimination: For pure tones or broadband noises at comfortable listening levels, the intensity JND is typically around 1 dB.
- ITD / IPD & Phase-Locking: Normal hearing listeners are exquisitely sensitive to ITDs, with detection thresholds near 10 µs. The average threshold for a 1000 Hz tone is roughly 11 µs. Auditory nerve fibers encode this by phase-locking to the stimulus waveform. Crucial Limit: Humans cannot resolve fine-structure ITD/IPD above ~1000-1400 Hz due to a loss of binaural phase-locking, and monaural phase-locking ceases entirely by roughly 4000-5000 Hz. Guardrail: Do not design experiments relying on temporal fine structure (TFS) cues for target frequencies above 4000 Hz.
- Frequency Range & Aging: The nominal range of human hearing is 20-20,000 Hz. However, sensitivity to frequencies above 15,000 Hz decreases significantly with age and noise exposure. Guardrail: When designing for the general population, avoid placing critical targets or maskers in the extreme high-frequency range (>12,000 Hz) unless the experiment specifically targets high-frequency audiometry.
- Gap Detection: For normal-hearing adults, the mean behavioral gap detection threshold for broadband noise is approximately 2 to 5 ms.
- Tonotopy & Tone-in-Noise Masking: The basilar membrane acts as a mechanical frequency analyzer, with high frequencies mapped to the base and low frequencies to the apex (tonotopy). This creates overlapping "auditory filters." Detection of a tone in noise is primarily energetic; a tone becomes audible once the signal-to-noise ratio within its specific "critical band" (Equivalent Rectangular Bandwidth, or ERB) is sufficiently high. Guardrail: Use the "erb" spacing in calc_frequencies to correctly model this physiological filter spacing.

METHODOLOGICAL PARADIGMS & PSYCHOPHYSICS:
- Adaptive Staircases: The engine uses n-down/1-up adaptive tracking. A 2-down/1-up rule targets the 70.7% correct point on the psychometric function, while a 3-down/1-up rule targets the 79.4% correct point.
- Step Types & Sizes: Step sizes should start large and systematically decrease after early reversals. Use the linear step type for additive units (like dB), but you must use the geometric step type for variables strictly bounded by zero (like percentage mistuning or AM depth).
- Roving: To prevent participants from using absolute energy or loudness cues, employ roving (e.g., applying a uniform random gain perturbation across all intervals) to force listeners to rely on the target cue.

SEMINAL REFERENCES FOR LITERATURE SEARCH:
Use these exact citations as search keys if you need to retrieve deeper methodological logic:
- Levitt, H. (1971). Transformed up-down methods in psychoacoustics. The Journal of the Acoustical Society of America. (Definitive guide to n-down/1-up rules).
- Fletcher, H. (1940). Auditory Patterns. Reviews of Modern Physics. (Critical Bands and tone-in-noise masking).
- Klumpp, R. G., & Eady, H. R. (1956). Some Measurements of Interaural Time Difference Thresholds. The Journal of the Acoustical Society of America. (Establishes the ~10 µs ITD acuity limit).
- Watson, C. S., & Fitzhugh, R. J. (1990). The method of constant stimuli is inefficient. The Journal of the Acoustical Society of America. (Rationale for adaptive procedures).
- Moore, B. C. J. (2012). An Introduction to the Psychology of Hearing. (The definitive textbook for general threshold yardsticks, ERB scales, and masking).
- Viemeister, N. F. (1979). Temporal modulation transfer function based upon modulation thresholds. The Journal of the Acoustical Society of America. (Baseline for AM detection and temporal resolution).

HIGH-LEVEL DESIGN & BATCHING:
- Bootstrapping: Use 'generate_config_from_template' to quickly create a standard experiment (e.g. Freq Discrimination) by providing just F0 and Level.
- Multi-Condition Studies: Use 'generate_batch_configs' to create multiple ExperimentConfigs at once (e.g., measuring ITD thresholds at 500, 1000, and 2000 Hz). This ensures consistency across conditions.
- Verification: Use 'summarize_experiment' to get a human-readable scientific summary of any config to verify it matches your experimental intent.`
            }]
          };
        case "list_examples":
          return {
            content: [{
              type: "text",
              // MAINTENANCE NOTE: Update this list whenever a new export is added to examples/examples.ts
              text: "Available Examples: freqDiscrim, auditoryGrouping, itdDiscrim, srim, tenTest, amDetection, profileAnalysis, gapDetection"
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
        case "generate_stimulus_block":
          return this.handleGenerateStimulusBlock(request.params.arguments);
        case "evaluate_and_finalize_experiment":
          return this.handleFinalize(request.params.arguments);
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
- description?: string — A detailed description shown on the selection screen and in the help popup
- literature_references?: string[] — Citation list
- advisor_warnings?: string[] — Custom warnings to surface in experiment design


## audio (required)
- sampleRate: number — Default 44100. Use 48000 for high-quality binaural work.

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
- deltaMicroseconds: value
- mode: "fine_structure" | "envelope" | "both" (default "both")
- ear: "left" | "right" (default "right")
- targetFrequency?: number — (Optional) target a specific component.

## paradigm (required)
- type: "2AFC" | "3AFC" | "Probe-Signal"
- intervals: Array<{ condition: "reference" | "target" | "probe" }>
- randomizeOrder: boolean — uses meta.seed for reproducibility
- timing:
  - isiMs: number — inter-stimulus interval
  - itiMs: number — inter-trial interval (default 1000ms); next trial always starts automatically after this interval
  - feedbackDurationMs: number — duration for which correct/incorrect feedback is displayed (default 400ms)
  - responseDelayMs: number — delay between end of stimulus and enabling response buttons (default 250ms)
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
- showReversals: boolean — Default true.
- showCurrentValue: boolean — Default false.
- showAverageThreshold: boolean — Default false.

## termination (required)
- reversals?: number — stop after N reversals (threshold averaged from reversal values, discarding first 4 by default)
- maxTrials?: number — stop after N trials regardless of reversals
- discardReversals?: number — number of initial reversals to discard when calculating the final threshold. Defaults to 4.
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
      usage: "Set onsetDelayMs on the LAGGING ear's component. The leading ear's component should have onsetDelayMs: 0.",
    };

    if (ipdDegrees !== null) {
      result.equivalentIpdDegrees = parseFloat(ipdDegrees.toFixed(2));
    }
    if (ipdWarning) result.warning = ipdWarning;

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleFinalize(args: any) {
    const result = ExperimentConfigSchema.safeParse(args.config);
    if (!result.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify(result.error.format(), null, 2) }] };
    }
    const config = result.data;
    const warnings: string[] = [];

    // 1. Worst-case Total power / clipping check.
    const getPerturbationMaxDb = (targetFreq: number | undefined, type: string) => {
      let maxDb = 0;
      if (!config.perturbations) return 0;
      for (const p of config.perturbations) {
        if (p.type === type && (!targetFreq || (p as any).targetFrequency === targetFreq)) {
          const val = (p as any).deltaDb;
          if (typeof val === 'number') maxDb += val;
          else if (val?.adaptive) maxDb += config.adaptive?.maxValue || 0;
          else if (val?.type === 'uniform') maxDb += val.max;
        }
      }
      return maxDb;
    };

    // Calculates peak power per interval (Target vs Reference) to account for applyTo filtering.
    const calculatePeakPower = (condition: "target" | "reference") => {
      let totalPowerL = 0;
      let totalPowerR = 0;
      
      const globalPertDb = getPerturbationMaxDb(undefined, 'gain');

      for (const gen of config.stimuli) {
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
        } else if (gen.type === "noise") {
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
        warnings.push(`CLIPPING RISK: Worst-case peak level (base + roving + adaptive max) exceeds 95 dB SPL (Estimated: ${totalDb.toFixed(1)} dB). While the engine normalizes, this may cause unwanted compression of background components.`);
      }
    }

    // 2. Adaptive staircase reversal count check
    const reversalCount = config.adaptive?.reversals ?? config.termination?.reversals ?? 0;
    if (config.adaptive && reversalCount < 10) {
      warnings.push(`STABILITY WARNING: Adaptive staircase reversals (${reversalCount}) are below 10. Threshold estimate may be unreliable. Recommend ≥12 reversals.`);
    }

    // Removed noise calibration warning since it is now supported via FFT magnitude shaping

    // 4. IPD paradigm check — phase_shift without ear targeting
    if (config.perturbations) {
      for (const p of config.perturbations) {
        if (p.type === "phase_shift" && !p.ear) {
          warnings.push(`IPD WARNING: A 'phase_shift' perturbation targets frequency ${p.targetFrequency} Hz but has no 'ear' field. If you have separate left/right components at this frequency, BOTH ears will be shifted — creating no net IPD. Set 'ear: \"right\"' (or \"left\") to target one ear.`);
        }
      }
    }


    // 5. Instruction UX suggestion
    if (!config.meta.summary) {
      if (config.paradigm.type === "2AFC" || config.paradigm.type === "3AFC") {
        warnings.push(`UX SUGGESTION: Consider adding meta.summary. E.g., 'Select the higher pitched tone.'`);
      }
    }


    // 6. Human Auditory Threshold Guardrails
    const allFrequencies: number[] = [];
    config.stimuli.forEach(s => {
      if (s.type === 'multi_component') (s.components as any[]).forEach(c => allFrequencies.push(c.frequency));
      else if (s.type === 'noise' && (s as any).bandLimit) {
        allFrequencies.push((s as any).bandLimit.lowFreq);
        allFrequencies.push((s as any).bandLimit.highFreq);
      }
      (s as any).modulators?.forEach((m: any) => {
        if (m.type === 'AM' && m.rateHz > 50) {
          warnings.push(`AUDITORY GUARDRAIL: AM rate of ${m.rateHz} Hz exceeds typical temporal envelope resolution (~50-60 Hz). At higher rates, listeners may perceive spectral sidebands or 'pitch' cues rather than fluctuations.`);
        }
      });
    });

    if (allFrequencies.some(f => f > 15000)) {
      warnings.push("AUDITORY GUARDRAIL: Stimulus contains frequencies > 15,000 Hz. Sensitivity at these frequencies decreases significantly with age and noise exposure.");
    }

    if (config.perturbations) {
      for (const p of config.perturbations) {
        if (p.type === 'itd' && p.mode !== 'envelope') {
          const targetFreq = (p as any).targetFrequency;
          if (targetFreq && targetFreq > 1400) {
            warnings.push(`AUDITORY GUARDRAIL: Fine-structure ITD/IPD sensitivity is poor above ~1400 Hz. Your perturbation targets ${targetFreq} Hz. Consider using 'envelope' mode or a lower frequency.`);
          } else if (!targetFreq && allFrequencies.some(f => f > 1400)) {
            warnings.push("AUDITORY GUARDRAIL: Broadband fine-structure ITD/IPD sensitivity is limited above ~1400 Hz. High-frequency components will not contribute to fine-structure cues.");
          }
        }
        if (p.type === 'phase_shift') {
          const targetFreq = (p as any).targetFrequency;
          if (targetFreq && targetFreq > 4000) {
            warnings.push(`AUDITORY GUARDRAIL: Phase-locking (required for fine-structure phase discrimination) ceases entirely above ~4000-5000 Hz. Your 'phase_shift' targets ${targetFreq} Hz and may be inaudible.`);
          }
        }
      }
    }


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
      const config = (examples as any)[`${name}Config`];
      if (!config) throw new Error(`Example '${name}Config' not found. Available: freqDiscrim, auditoryGrouping, itdDiscrim, srim, tenTest, amDetection, profileAnalysis, gapDetection`);
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
      const baseConfig = (examples as any)[`${templateName}Config`];
      if (!baseConfig) throw new Error(`Template '${templateName}' not found.`);

      let config = JSON.parse(JSON.stringify(baseConfig)); // Deep clone

      if (parameters.name) config.meta.name = parameters.name;

      // High-level mapping logic
      if (parameters.frequencyHz !== undefined) {
        config.stimuli.forEach((s: any) => {
          if (s.type === 'multi_component') {
            s.components.forEach((c: any) => {
              // Heuristic: update components that were at the 'nominal' frequency (usually 1000)
              // or if it's a single-component stimulus.
              if (c.frequency === 1000 || s.components.length === 1) c.frequency = parameters.frequencyHz;
            });
          }
        });
        config.perturbations?.forEach((p: any) => {
          if ('targetFrequency' in p && (p.targetFrequency === 1000 || p.targetFrequency === undefined)) {
            p.targetFrequency = parameters.frequencyHz;
          }
        });
      }

      if (parameters.levelDb !== undefined) {
        config.stimuli.forEach((s: any) => { s.levelDb = parameters.levelDb; if (s.components) s.components.forEach((c: any) => c.levelDb = parameters.levelDb); });
      }

      if (parameters.durationMs !== undefined) {
        config.stimuli.forEach((s: any) => s.durationMs = parameters.durationMs);
      }

      if (parameters.adaptiveInitialValue !== undefined && config.adaptive) {
        config.adaptive.initialValue = parameters.adaptiveInitialValue;
      }

      if (parameters.adaptiveStepSizes !== undefined && config.adaptive) {
        config.adaptive.stepSizes = parameters.adaptiveStepSizes;
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

    const summary = `
# Experiment Summary: ${config.meta.name}
**Paradigm**: ${config.paradigm.type} (${config.paradigm.randomizeOrder ? "Randomized" : "Fixed Order"})
**Rationale**: ${config.meta.rationale || "N/A"}

## Stimuli
${config.stimuli.map((s, i) => {
      const applyToStr = (s as any).applyTo && (s as any).applyTo !== "all" ? ` [${(s as any).applyTo}]` : "";
      if (s.type === 'multi_component') {
        return `- Generator ${i + 1}: Multi-component (${s.components.length} tones), ${s.durationMs}ms${applyToStr}`;
      } else {
        return `- Generator ${i + 1}: ${s.noiseType} noise, ${s.durationMs}ms${applyToStr}`;
      }
    }).join('\n')}

## Logic
**Adaptive Tracking**: ${config.adaptive ? `Yes (${config.adaptive.rule.correctDown}-down/1-up on ${config.adaptive.parameter})` : "No (Fixed)"}
**Step Sizes**: ${config.adaptive?.stepSizes.join(', ') || "N/A"} ${config.adaptive?.unit || ""}
**Termination**: ${config.termination.reversals ? `${config.termination.reversals} reversals` : `${config.termination.maxTrials} trials`}

## Perturbations
${config.perturbations?.map(p => `- ${p.type} on ${'targetFrequency' in p ? p.targetFrequency + "Hz" : "all"}: ${JSON.stringify((p as any).deltaDb || (p as any).deltaPercent || (p as any).deltaMicroseconds)}`).join('\n') || "None"}
`;

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
