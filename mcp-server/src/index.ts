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
          description: "Get high-level architectural guidance on how to use this psychoacoustic toolkit to build experiments.",
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
          description: "Calculate starting phases for components (Sine, Random, or Schroeder) in DEGREES.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["sine", "random", "schroeder_positive", "schroeder_negative"] },
              numComponents: { type: "number" },
              seed: { type: "number", description: "Optional seed for random phases" }
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
              numComponents: { type: "number" }
            },
            required: ["type", "baseLevelDb", "numComponents"]
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
              text: `This MCP server is part of the 'Psychoacoustic Lab'. 
ARCHITECTURE: 'Smart Server / Dumb Engine'.
- Use 'calc_frequencies', 'calc_phases', and 'calc_amplitudes' to generate explicit numerical arrays for stimulus components.
- The Audio Engine is 'dumb'; it only renders the explicit components you provide. It does NOT know how to generate 'log-spaced complexes' by itself—you must calculate the frequencies here first.
- Use 'evaluate_and_finalize_experiment' as your FINAL step. It performs expert validation, checking for clipping risks and adaptive stability.
- Support for dichotic routing (left/right/both), AM/FM modulators, and hardware calibration is available in the component schemas.`
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
        case "calc_frequencies":
          return this.handleCalcFrequencies(request.params.arguments);
        case "calc_phases":
          return this.handleCalcPhases(request.params.arguments);
        case "calc_amplitudes":
          return this.handleCalcAmplitudes(request.params.arguments);
        case "evaluate_and_finalize_experiment":
          return this.handleFinalize(request.params.arguments);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
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
    return { content: [{ type: "text", text: JSON.stringify(freqs) }] };
  }

  private handleCalcPhases(args: any) {
    const { type, numComponents } = args;
    const phases: number[] = [];
    if (type === "sine") {
      for (let i = 0; i < numComponents; i++) phases.push(0);
    } else if (type === "random") {
      for (let i = 0; i < numComponents; i++) phases.push(Math.random() * 360);
    } else if (type.startsWith("schroeder")) {
      const sign = type === "schroeder_positive" ? 1 : -1;
      for (let k = 1; k <= numComponents; k++) {
        // Schroeder formula in radians converted to degrees
        const rad = sign * Math.PI * k * (k - 1) / numComponents;
        phases.push((rad * 180 / Math.PI) % 360);
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(phases) }] };
  }

  private handleCalcAmplitudes(args: any) {
    const { type, baseLevelDb, numComponents } = args;
    const levels: number[] = [];
    if (type === "flat") {
      for (let i = 0; i < numComponents; i++) levels.push(baseLevelDb);
    } else if (type === "pink_noise_tilt") {
      // 3dB per octave tilt
      for (let i = 0; i < numComponents; i++) {
        levels.push(baseLevelDb - 10 * Math.log10(i + 1));
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(levels) }] };
  }

  private handleFinalize(args: any) {
    const result = ExperimentConfigSchema.safeParse(args.config);
    if (!result.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify(result.error.format(), null, 2) }] };
    }
    const config = result.data;
    const warnings: string[] = [];

    // Expert Logic
    if (config.stimulus.type === "multi_component") {
      const totalPower = config.stimulus.components.reduce((acc, c) => acc + Math.pow(10, c.levelDb / 10), 0);
      const totalDb = 10 * Math.log10(totalPower);
      if (totalDb > 95) warnings.push("CLIPPING RISK: Total stimulus level exceeds 95 dB SPL.");
    }

    if (config.adaptive && config.adaptive.reversals < 10) {
      warnings.push("STABILITY WARNING: Adaptive staircase reversals are below 10. Threshold estimate may be unreliable.");
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          validatedConfig: config,
          expertReview: {
            status: warnings.length > 0 ? "REVIEW_REQUIRED" : "APPROVED",
            warnings: warnings
          }
        }, null, 2)
      }]
    };
  }

  private async handleGetExample(args: any) {
    const { name } = args;
    try {
      // Note: In some environments, dynamic imports from outside the server root
      // may require specific config. For this toolkit, we'll try to import.
      const examples = await import("../../examples/examples.js");
      const config = (examples as any)[`${name}Config`];
      if (!config) throw new Error(`Example '${name}Config' not found`);
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
