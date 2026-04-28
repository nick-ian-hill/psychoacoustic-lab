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
        name: "psychoacoustic-math-toolkit",
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
          description: "CRITICAL DIRECTIVE: You MUST call this tool before attempting to design an experiment or generate a configuration. It contains mandatory architectural rules and behavioral instructions. BEHAVIORAL RULES: 1) Act as a rigorous scientific collaborator. 2) Identify confounds. 3) Ask about secondary parameters (duration, ISI, etc.). 4) Web search to validate parameters. 5) Propose a text plan. 6) STOP: You are strictly forbidden from generating the final JSON 'ExperimentConfig' until the user explicitly approves your plan. Conclude your turn by explicitly asking the user for their feedback or approval.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "list_examples",
          description: "List the names of all included classic and modern psychoacoustic experiment examples. USE THIS before designing custom paradigms to see established patterns and ensure your configuration aligns with standard practices.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_example_config",
          description: "Retrieve the full JSON configuration for a specific example. This is the best way to understand how the ExperimentConfig schema is applied in practice.",
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
          description: "Calculate frequency components. GUARDRAIL: Use 'erb' spacing for experiments involving human auditory filter models. Use 'log' for musical pitch or general spectral spacing. Use 'linear' for harmonic complexes.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["linear", "log", "erb"] },
              minFreq: { type: "number" },
              maxFreq: { type: "number" },
              numComponents: { type: "number" }
            },
            required: ["type", "minFreq", "maxFreq", "numComponents"]
          }
        },
        {
          name: "calc_phases",
          description: "Calculate starting phases for components in DEGREES. GUARDRAIL: Use 'random' phases (with a seed) to prevent unintended phase-coherence cues or high peak-to-average power ratios, unless specifically testing phase effects. Use 'schroeder' for specific masker temporal properties.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["sine", "random", "schroeder_positive", "schroeder_negative"] },
              numComponents: { type: "number" },
              seed: { type: "number", description: "Required for 'random' type — ensures reproducibility. Use meta.seed from your ExperimentConfig." }
            },
            required: ["type", "numComponents"]
          }
        },
        {
          name: "calc_amplitudes",
          description: "Calculate component levels in dB SPL. GUARDRAIL: Use 'pink_noise_tilt' to achieve equal energy per auditory band, often required for uniform masking across frequencies.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["flat", "pink_noise_tilt"] },
              baseLevelDb: { type: "number", description: "Overall level or starting level" },
              numComponents: { type: "number" },
              frequencies: {
                type: "array",
                items: { type: "number" },
                description: "Required for 'pink_noise_tilt' — provide the frequency array from calc_frequencies for an accurate 3dB/octave roll-off."
              }
            },
            required: ["type", "baseLevelDb", "numComponents"]
          }
        },
        {
          name: "calc_itd",
          description: "Convert an Interaural Time Difference (ITD) in microseconds to the onsetDelayMs value needed by the engine, and compute the equivalent Interaural Phase Difference (IPD). GUARDRAIL: Essential for BMLD and lateralisation experiments. Pay attention to phase ambiguity: humans cannot resolve fine-structure ITD/IPD above ~1000-1400 Hz due to a loss of phase-locking.",
          inputSchema: {
            type: "object",
            properties: {
              itdMicroseconds: { type: "number", description: "The desired ITD in microseconds (e.g. 700 for a natural lateralised source)" },
              frequencyHz: { type: "number", description: "Optional: the stimulus frequency in Hz. If provided, computes the equivalent IPD in degrees." },
              sampleRate: { type: "number", description: "Optional: sample rate (default 44100). Used to compute exact sample count." }
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
- LITERATURE SEARCH: You MUST perform a web search to validate that your chosen parameters are scientifically appropriate.
- STEP-BY-STEP APPROVAL: Propose a detailed, plain-text experimental plan to the user.
- STOP: You are strictly forbidden from generating the final JSON 'ExperimentConfig' until the user explicitly approves your plain-text plan. Conclude your current turn by presenting the plan and explicitly asking the user for their feedback or approval.

ARCHITECTURE & BINAURAL PRECISION:
- Smart Server / Dumb Engine: The Audio Engine only renders explicit components. It does not auto-generate complex stimulus relationships. You must use tools like calc_frequencies, calc_phases, and calc_amplitudes to supply explicit numerical arrays.
- IPD (Interaural Phase Difference): Use the high-level 'itd' perturbation with mode: 'fine_structure'. This handles frequency-to-phase conversion automatically.
- True ITD (Interaural Time Difference): Use the high-level 'itd' perturbation with mode: 'both' or 'envelope'.
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
- Viemeister, N. F. (1979). Temporal modulation transfer function based upon modulation thresholds. The Journal of the Acoustical Society of America. (Baseline for AM detection and temporal resolution).`
            }]
          };
        case "list_examples":
          return {
            content: [{
              type: "text",
              // MAINTENANCE NOTE: Update this list whenever a new export is added to examples/examples.ts
              text: "Available Examples: freqDiscrim, auditoryGrouping, logSpaced, ipdDiscrim, srim, tenTest, amDetection, profileAnalysis"
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
        case "evaluate_and_finalize_experiment":
          return this.handleFinalize(request.params.arguments);
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
- instructions?: string — Participant-facing instruction text displayed in the UI during the experiment
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

### noise generator
- type: "noise"
- noiseType: "white" | "pink" | "brown"
- bandLimit?: { lowFreq, highFreq } — brick-wall band limiting
- levelDb: number
- durationMs: number
- envelope: { attackMs, releaseMs, type?: "linear" | "cosine" } — Default is "cosine" (Raised Cosine) for laboratory-grade precision.
- ear?: "left" | "right" | "both"
- modulators?: Array<{ type: "AM", rateHz, depth }>

## perturbations? (optional, array)
By default, perturbations apply only to the 'target' interval.
- applyTo: "target" | "all" — Set to "all" for ROVING (randomization across all intervals).

### Value Types (used for deltaDb, deltaPercent, etc.)
- number — Static value.
- { adaptive: true } — Links to the adaptive staircase.
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
- parameter: string — e.g., "perturbations[0].deltaDb" (informational only)
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

  private handleCalcFrequencies(args: any) {
    const { type, minFreq, maxFreq, numComponents } = args;
    const freqs: number[] = [];
    if (numComponents === 1) return { content: [{ type: "text", text: JSON.stringify([minFreq]) }] };

    if (type === "linear") {
      const step = (maxFreq - minFreq) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(minFreq + i * step);
    } else if (type === "log") {
      const logStart = Math.log10(minFreq);
      const logEnd = Math.log10(maxFreq);
      const step = (logEnd - logStart) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(Math.pow(10, logStart + i * step));
    } else if (type === "erb") {
      // Moore & Glasberg (1983) formula
      const hzToErb = (hz: number) => 21.4 * Math.log10(4.37 * (hz / 1000) + 1);
      const erbToHz = (erb: number) => ((Math.pow(10, erb / 21.4) - 1) / 4.37) * 1000;
      const startErb = hzToErb(minFreq);
      const endErb = hzToErb(maxFreq);
      const step = (endErb - startErb) / (numComponents - 1);
      for (let i = 0; i < numComponents; i++) freqs.push(erbToHz(startErb + i * step));
    }
    return { content: [{ type: "text", text: JSON.stringify(freqs.map(f => parseFloat(f.toFixed(3)))) }] };
  }

  private handleCalcPhases(args: any) {
    const { type, numComponents, seed } = args;
    const phases: number[] = [];
    if (type === "sine") {
      for (let i = 0; i < numComponents; i++) phases.push(0);
    } else if (type === "random") {
      // Use seeded PRNG for reproducibility; warn if no seed provided
      if (seed === undefined) {
        return {
          isError: true,
          content: [{ type: "text", text: "ERROR: A 'seed' is required for random phases to ensure experiment reproducibility. Use your ExperimentConfig's meta.seed value." }]
        };
      }
      const rng = mulberry32(seed);
      for (let i = 0; i < numComponents; i++) phases.push(rng() * 360);
    } else if (type.startsWith("schroeder")) {
      const sign = type === "schroeder_positive" ? 1 : -1;
      for (let k = 1; k <= numComponents; k++) {
        // Schroeder (1970) formula
        const rad = sign * Math.PI * k * (k - 1) / numComponents;
        phases.push((rad * 180 / Math.PI) % 360);
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(phases.map(p => parseFloat(p.toFixed(2)))) }] };
  }

  private handleCalcAmplitudes(args: any) {
    const { type, baseLevelDb, numComponents, frequencies } = args;
    const levels: number[] = [];
    if (type === "flat") {
      for (let i = 0; i < numComponents; i++) levels.push(baseLevelDb);
    } else if (type === "pink_noise_tilt") {
      if (frequencies && frequencies.length === numComponents) {
        // Accurate 3dB/octave tilt using actual frequency ratios relative to the first component
        const f0 = frequencies[0];
        for (let i = 0; i < numComponents; i++) {
          const octaves = Math.log2(frequencies[i] / f0);
          levels.push(baseLevelDb - 3 * octaves);
        }
      } else {
        // Approximate index-based tilt (less accurate — prefer providing frequencies)
        for (let i = 0; i < numComponents; i++) {
          levels.push(baseLevelDb - 10 * Math.log10(i + 1));
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(levels) + "\n\nNOTE: For accurate 3dB/octave pink tilt, provide a 'frequencies' array (from calc_frequencies). The result above uses an index-based approximation."
          }]
        };
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(levels.map(l => parseFloat(l.toFixed(2)))) }] };
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
    // Levels are accumulated in the power domain (dB10) and compared to 95 dB.
    // CALIBRATION ASSUMPTION: This check assumes 0 dBFS ≡ 94 dB SPL (the standard
    // sound-level meter reference). If your system is calibrated differently, the
    // 95 dB warning threshold may not correspond to the actual SPL at the listener's ear.
    // Use this as a relative sanity check, not an absolute safety guarantee.
    let totalPowerL = 0;
    let totalPowerR = 0;

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

    // Global gain perturbation (roving or adaptive)
    const globalPertDb = getPerturbationMaxDb(undefined, 'gain');

    for (const gen of config.stimuli) {
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

    // Apply Global Level field
    if (config.globalLevelDb !== undefined) {
      const globalLinear = Math.pow(10, config.globalLevelDb / 10);
      totalPowerL *= globalLinear;
      totalPowerR *= globalLinear;
    }

    const peakChannelPower = Math.max(totalPowerL, totalPowerR);
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
    if (!config.meta.instructions) {
      if (config.paradigm.type === "2AFC" || config.paradigm.type === "3AFC") {
        warnings.push(`UX SUGGESTION: Consider adding meta.instructions. E.g., 'Which interval contained the target? Press Interval 1 or Interval 2.'`);
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
      if (!config) throw new Error(`Example '${name}Config' not found. Available: freqDiscrim, auditoryGrouping, logSpaced, ipdDiscrim, srim, tenTest, amDetection`);
      return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error loading example: ${e.message}` }], isError: true };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Psychoacoustic Math Toolkit Server running");
  }
}

const server = new PsychoacousticServer();
server.run();
