# Psychoacoustic Lab

An advanced, flexible platform for designing and running psychoacoustic experiments. It combines a Web Audio synthesis engine with an MCP (Model Context Protocol) server to provide lab-grade acoustic precision and AI-assisted experiment generation.

## AI Integration (MCP)

This project includes a built-in **Model Context Protocol (MCP)** server that allows AI agents to help you design experiments and validate configurations. This server communicates via **stdio**.

### 1. Antigravity / Gemini CLI
Add the following to your `mcp_config.json` (typically in `%USERPROFILE%\.gemini\antigravity\`):

```json
{
  "mcpServers": {
    "psychoacoustic-lab": {
      "command": "node",
      "args": [
        "--loader",
        "ts-node/esm",
        "C:/Users/Nick/Development/psychoacoustic-lab/mcp-server/src/index.ts"
      ],
      "cwd": "C:/Users/Nick/Development/psychoacoustic-lab/mcp-server",
      "env": {
        "NODE_OPTIONS": "--no-warnings"
      }
    }
  }
}
```

### 2. GitHub Copilot (VS Code)
To use the psychoacoustic-lab MCP server within VS Code, you can configure it as a workspace-specific server:

1. **Create a workspace**: Open your project folder in VS Code.
2. **Create the MCP configuration**:
   - Inside the folder, create a `.vscode` directory.
   - Inside that directory, create a file named `mcp.json`.
3. **Add the server reference**: Paste the following configuration into `mcp.json`:

```json
{
  "servers": {
    "psychoacoustic-lab": {
      "command": "node",
      "args": [
        "--loader",
        "ts-node/esm",
        "C:/Users/Nick/Development/psychoacoustic-lab/mcp-server/src/index.ts"
      ],
      "cwd": "C:/Users/Nick/Development/psychoacoustic-lab/mcp-server",
      "env": {
        "NODE_OPTIONS": "--no-warnings"
      }
    }
  }
}
```

### 3. Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "psychoacoustic-lab": {
      "command": "node",
      "args": [
        "--loader",
        "ts-node/esm",
        "C:/Users/Nick/Development/psychoacoustic-lab/mcp-server/src/index.ts"
      ]
    }
  }
}
```

## Architecture

The project is split into three main components:

1. **`shared/schema.ts`**: The source of truth. Defines Zod schemas for `ExperimentConfig`, including a highly flexible `MultiComponentGenerator` capable of modeling arbitrary acoustic scenes with explicit frequency, level, phase, and dichotic routing per component.
2. **`mcp-server`**: A "Math Toolkit" and Expert Advisor. It exposes tools to an AI agent to calculate complex arrays (e.g., log-spaced frequencies, Schroeder phases, pink noise tilts, ITD/IPD conversions) and provides a final validation endpoint that checks for per-channel clipping risks, adaptive stability, calibration mismatches, and IPD configuration errors.
3. **`web-app`**: A complete frontend execution environment featuring a dark-mode UI for running adaptive staircase trials, and a high-performance **Web Worker**-based audio engine that handles complex real-time synthesis without blocking the main thread.

## Features

- **Synchronized UI Feedback**: Interval buttons highlight in precise synchrony with audio stimuli by scheduling `setTimeout` callbacks against the `AudioContext` clock (including hardware output latency), rather than the wall clock. This eliminates drift from GC pauses and event-loop jitter.
- **Raised Cosine Ramps**: Support for both Linear and Raised Cosine (Hann) onset/offset ramps. Raised Cosine ramps provide the cleanest possible spectrum by ensuring a zero-slope transition at the start and end of the sound.
- **Automatic Trial Advancement**: Support for configurable Inter-Trial Intervals (`itiMs`), allowing for high-throughput, automated experiment runs without manual clicking.
- **Scientific Control**: Configurable `allowReplay` flag to restrict or permit stimulus re-exposure, ensuring experimental rigor.
- **Fully Reproducible Experiments**: `meta.seed` controls the FFT noise RNG, trial-order randomization, and all dynamic perturbation randomizations (roving levels, phase), ensuring every run is exactly reproducible.
- **Constrained Randomization**: Mark specific intervals as `"fixed": true` to exclude them from the randomization process. This enables standard professional paradigms like **4I2AFC** (4-interval 2-alternative forced choice), where intervals 1 and 4 are fixed references and the target only shuffles between 2 and 3.
- **Advanced Roving & Randomization**: Apply interval-level global roving or component-level jitter across multiple physical dimensions. All perturbations support `RandomUniform` distributions and can target only the signal interval or `"all"` intervals for true roving. Omit the `targetFrequency` on any perturbation to apply it globally to all components in the stimulus:
  - **Level**: via `gain` (global) or `spectral_profile` (per-component).
  - **Frequency**: via `mistuning` (supports global pitch roving).
  - **Timing**: via `onset_asynchrony` (supports global onset roving).
  - **Phase**: via `phase_shift` (supports global phase roving).
  - **Modulation**: via `am_depth` (supports global AM depth roving).
- **Adaptive Staircase**: Full-featured `StaircaseController` supporting N-down/1-up rules, fast-start logic (`initialN`/`switchReversalCount`), dynamic step-size reduction on reversals, and standard reversal-point threshold averaging (with configurable `discardReversals`, defaulting to 4).
- **FFT-Based Noise Synthesis**: Lab-grade broadband noise generation in the frequency domain. Supports White, Pink ($1/f$), and Brown ($1/f^2$) spectra with perfectly sharp brick-wall band-limiting.
- **AM & FM Modulations**: Sinusoidal Amplitude and Frequency modulation support for both components and noise carriers, including adaptive `am_depth` perturbations.
- **Web Worker Synthesis**: Offloads all heavy sample-by-sample calculations and FFT operations to a background thread, ensuring a stutter-free 60 fps UI and utilizing zero-copy Transferable objects for maximum efficiency.
- **Binaural Temporal Precision**: Explicitly decouples fine-structure phase shifts (IPD) from gated stimulus onset shifts (True ITD), automatically managing buffer padding to prevent sample clipping. The `ear` field on `phase_shift` perturbations ensures only the target channel is shifted, creating a genuine interaural phase difference.
- **Global Level Control**: Apply a master trim gain (`globalLevelDb`) to the entire trial stimulus. This occurs after per-generator synthesis but before final normalization, providing a clean way to adjust overall presentation levels while maintaining calibrated relative component ratios.
- **Interval-Specific Stimuli**: Use the `applyTo` field on any stimulus generator (`"target"`, `"reference"`, or `"all"`) to define complex scenes where sounds only play in specific intervals (e.g., adding a target tone to a noise masker only in the signal interval).
- **Multi-Layer Masking**: Stack an arbitrary array of independent stimulus generators (e.g., noise maskers and multi-component targets) into a single composite interval. Combined with `applyTo`, this enables clean, explicit modeling of Signal-in-Noise paradigms without architectural hacks.
- **Dynamic Participant Instructions**: Supply experiment-specific metadata via `meta.summary` (concise task instructions) and `meta.description` (long-form detailed guidance).
- **Dichotic Routing**: Route components independently to the left, right, or both ears, enabling Binaural Masking Level Difference (BMLD) and Spatial Release from Masking (SRM) paradigms.
- **Termination & Thresholding**: Configure exactly how and when an experiment ends:
  - **`reversals`**: Stop after $N$ reversals (standard for staircase).
  - **`maxTrials`**: A safety limit to end the experiment regardless of performance.
  - **`discardReversals`**: Automatically ignore the first $N$ reversals (default 4) to ensure threshold averaging only uses stable performance data.
- **Hardware Calibration**: Apply log-frequency interpolated dB offsets to both `multi_component` and `noise` generators (via frequency-domain magnitude shaping) to account for transducer frequency responses.
- **Runtime Perturbations**: Dynamically alter components (Mistuning, Spectral Profile, Onset Asynchrony, Phase Shift, AM Depth) based on the adaptive staircase value.
- **Data Export**: Download detailed trial history as both **JSON** and **CSV** files. The JSON export contains the full experimental configuration and high-precision history, while the CSV format is optimized for direct import into the Python analysis pipeline. Both include the exact numerical state of all random and adaptive perturbations for perfect mathematical reconstructability.

## MCP Server Tools

| Tool | Description |
|------|-------------|
| `about_toolkit` | High-level architectural guidance on using the toolkit |
| `list_examples` | List all included example experiment names |
| `get_example_config` | Retrieve the full JSON config for a named example |
| `get_schema_reference` | Annotated documentation for every `ExperimentConfig` field — use this before building a new experiment |
| `calc_frequencies` | Calculate component frequencies with linear, log, or ERB spacing |
| `calc_phases` | Calculate component phases (Sine, Schroeder+/-, or seeded Random) |
| `calc_amplitudes` | Calculate component levels in dB (Flat or accurate 3 dB/octave Pink Tilt) |
| `calc_itd` | Convert ITD in microseconds to `onsetDelayMs`, with equivalent IPD in degrees and phase-ambiguity warnings |
| `evaluate_and_finalize_experiment` | Expert validation: per-channel clipping check, reversal count, IPD ear-targeting check |

## Getting Started

1. Install dependencies across all workspaces:
   ```bash
   npm install
   ```

2. Run the frontend application:
   ```bash
   cd web-app
   npm run dev
   ```

3. Configure your AI agent to use the MCP Server:
   ```bash
   cd mcp-server
   npm start
   ```

## Python Analysis Application

A dedicated Python Streamlit application is included in the `analysis/` directory for rigorous psychometric curve fitting (Logistic, Weibull) and signal detection theory analysis on the exported CSV data.

1. Ensure Python 3 is installed on your system.
2. Install the analysis dependencies:
   ```bash
   cd analysis
   pip install -r requirements.txt
   ```
3. Run the interactive dashboard:
   ```bash
   streamlit run app.py
   ```
4. Upload your `.csv` results file to fit curves and calculate accurate thresholds.

## Included Examples (`examples/examples.ts`)

All examples include participant-facing metadata displayed in the UI.

| Example | Key Paradigm | Literature |
|---------|-------------|-----------|
| **Frequency Discrimination** | 3-down/1-up mistuning threshold | Classic psychophysics |
| **Auditory Grouping** | Profile analysis with onset-asynchrony lead target | Hill & Bailey |
| **ITD/IPD Discrimination (TFS)** | Binaural phase shift threshold; sensitive to hidden hearing loss | Moore (2014); Prendergast et al. (2017) |
| **Spatial Release from Informational Masking** | Dichotic target vs. co-located maskers | Kidd Jr et al. (2016); Gallun et al. (2013) |
| **TEN Test** | Tone-in-noise detection for cochlear dead regions | Moore et al. (2000) |
| **AM Detection** | 8 Hz amplitude modulation depth threshold | Viemeister (1979) |
| **Profile Analysis** | Complex masking, global level roving, and individual component level randomization | Green (1988) |

## Limitations & Future Work

- **Result Aggregation**: The current export is per-session. Multi-session threshold averaging and participant management are outside the current scope.
