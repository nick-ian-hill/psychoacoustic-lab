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
          description: "CRITICAL DIRECTIVE: You MUST call this tool before attempting to design an experiment or generate a configuration. It contains mandatory architectural rules and behavioral instructions. BEHAVIORAL RULES: 1) Act as a rigorous scientific collaborator. 2) Before drafting a config, think critically about the experimental paradigm—actively identify and discuss how to control for confounding cues (e.g., controlling absolute pitch cues in a mistuning task). 3) Propose a detailed, plain-text experimental plan to the user. 4) STOP. You are strictly forbidden from generating the final JSON ExperimentConfig until the user explicitly approves your plain-text plan.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "list_examples",
          description: "List the names of all included classic and modern psychoacoustic experiment examples.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_example_config",
          description: "Retrieve the full JSON configuration for a specific example.",
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
          description: "Return annotated documentation for the full ExperimentConfig schema — all fields, types, and usage notes. Use this before building a new experiment to understand what fields are available.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "calc_frequencies",
          description: "Calculate frequency components (linear, log, or ERB spacing).",
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
          description: "Calculate starting phases for components (Sine, Random, or Schroeder) in DEGREES. Pass a seed for reproducible random phases.",
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
          description: "Calculate component levels in dB SPL (Flat or Pink Tilt).",
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
          description: "Convert an Interaural Time Difference (ITD) in microseconds to the onsetDelayMs value needed by the engine, and compute the equivalent Interaural Phase Difference (IPD) in degrees at a given frequency. Essential for BMLD and lateralisation experiments.",
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
          description: "Final validation and expert review of an ExperimentConfig.",
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
1. SCIENTIFIC COLLABORATION: Act as a rigorous scientific collaborator, not just a code generator.
2. CONFOUND CONTROL: Before proposing a design, you must actively identify and discuss how to control for confounding cues (e.g., controlling absolute pitch cues in a mistuning task by jittering the fundamental frequency).
3. STEP-BY-STEP APPROVAL: Propose a detailed, plain-text experimental plan to the user.
4. STOP: You are strictly forbidden from generating the final JSON 'ExperimentConfig' until the user explicitly approves your plain-text plan.

--------------------------------------------------

This MCP server is part of the 'Psychoacoustic Lab'. 
ARCHITECTURE: 'Smart Server / Dumb Engine'.
- Use 'calc_frequencies', 'calc_phases', and 'calc_amplitudes' to generate explicit numerical arrays for stimulus components.
- The Audio Engine is 'dumb'; it only renders the explicit components you provide. It does NOT know how to generate 'log-spaced complexes' by itself—you must calculate the frequencies here first.
- Use 'get_schema_reference' to see all available ExperimentConfig fields before writing a config.
- Use 'evaluate_and_finalize_experiment' as your FINAL step. It performs expert validation, checking for clipping risks and adaptive stability.
- BINAURAL PRECISION:
  * For IPD (Interaural Phase Difference): Set 'onsetDelayMs' to 0 and use 'phaseDegrees' to shift one ear's component. Set 'ear' on the PhaseShiftPerturbation to target only that ear.
  * For True ITD (Interaural Time Difference): Use 'onsetDelayMs' to shift the entire gated stimulus. Use 'calc_itd' to convert microseconds to ms.
  * The engine handles 'maxAbsoluteDelay' automatically to ensure leading sounds start at 0 and no samples are clipped.
- MULTI-LAYER MASKING: Use the 'stimuli' array in the ExperimentConfig to layer multiple generators (e.g., a noise masker and a multi-component target) within the same interval.
- CALIBRATION NOTE: The calibration profile applies log-frequency interpolated offsets to both multi_component generators and broadband noise generators (via FFT magnitude shaping).`
            }]
          };
        case "list_examples":
          return {
            content: [{
              type: "text",
              text: "Available Examples: freqDiscrim, auditoryGrouping, logSpaced, ipdDiscrim, srim, tenTest, amDetection"
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
Applied only to the TARGET interval. Each type:

### spectral_profile
- targetFrequency: number — must match a component frequency
- deltaDb: number | { adaptive: true } — added to component levelDb

### onset_asynchrony
- targetFrequency: number
- delayMs: number | { adaptive: true }

### mistuning
- targetFrequency: number
- deltaPercent: number | { adaptive: true }

### phase_shift
- targetFrequency: number
- ear?: "left" | "right" | "both" — IMPORTANT: set this to target a single ear for true IPD
- deltaDegrees: number | { adaptive: true }

### am_depth
- targetFrequency?: number — optional; omit to apply to broadband noise
- deltaDepth: number | { adaptive: true } — added to modulator depth (0–1)

## paradigm (required)
- type: "2AFC" | "3AFC" | "Probe-Signal"
- intervals: Array<{ condition: "reference" | "target" | "probe" }>
- randomizeOrder: boolean — uses meta.seed for reproducibility
- timing:
  - isiMs: number — inter-stimulus interval
  - itiMs?: number — inter-trial interval; if set, next trial auto-starts
  - allowReplay?: boolean — if true, participant can re-listen before responding

## adaptive? (optional)
- type: "staircase"
- parameter: string — e.g., "perturbations[0].deltaDb" (informational only)
- initialValue: number
- stepSizes: number[] — step sizes; later entries used after each reversal
- rule: { correctDown: number } — e.g., { correctDown: 3 } for 3-down/1-up
- initialN?: number — fast-start: use N-down/1-up until switchReversalCount reversals
- switchReversalCount?: number — reversal count at which fast-start ends
- minValue: number
- maxValue: number

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

    // 1. Total power / clipping check across all layers, per channel
    let totalPowerL = 0;
    let totalPowerR = 0;
    for (const gen of config.stimuli) {
      if (gen.type === "multi_component") {
        for (const c of gen.components as any[]) {
          const p = Math.pow(10, c.levelDb / 10);
          if (c.ear === "left") { totalPowerL += p; }
          else if (c.ear === "right") { totalPowerR += p; }
          else { totalPowerL += p; totalPowerR += p; }
        }
      } else if (gen.type === "noise") {
        const p = Math.pow(10, gen.levelDb / 10);
        if (gen.ear === "left") { totalPowerL += p; }
        else if (gen.ear === "right") { totalPowerR += p; }
        else { totalPowerL += p; totalPowerR += p; }
      }
    }

    // Apply Global Level
    if (config.globalLevelDb !== undefined) {
      const globalLinear = Math.pow(10, config.globalLevelDb / 10);
      totalPowerL *= globalLinear;
      totalPowerR *= globalLinear;
    }

    const peakChannelPower = Math.max(totalPowerL, totalPowerR);
    if (peakChannelPower > 0) {
      const totalDb = 10 * Math.log10(peakChannelPower);
      if (totalDb > 95) {
        warnings.push(`CLIPPING RISK: Peak channel level exceeds 95 dB SPL (Estimated: ${totalDb.toFixed(1)} dB). The engine normalizes automatically, but this may indicate incorrect level settings.`);
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
