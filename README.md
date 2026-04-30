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

1. **`shared/schema.ts`**: The source of truth. Defines Zod schemas for `ExperimentConfig`, utilizing a **Block-Based Architecture** for multi-stage studies (e.g., Practice → Test).
2. **`mcp-server`**: A "Math Toolkit" and Expert Advisor. Includes **Specialized Stimulus Utilities** for generating complex configurations like notched noise, harmonic complexes, and BMLD presets. It provides a final validation endpoint that checks for per-block clipping risks, adaptive stability, calibration mismatches, and IPD configuration errors across all blocks. High-level architectural and procedural guidance is provided in `GEMINI.md` and `SKILLS.md`.
3. **`web-app`**: A complete frontend execution environment. The UI provides per-block metadata and instructions, while the **Web Worker**-based audio engine handles advanced synthesis like FIR filtering and correlated noise modulation.

## Features

- **Raised Cosine Ramps**: Support for both Linear and Raised Cosine (Hann) onset/offset ramps. Raised Cosine ramps provide the cleanest possible spectrum by ensuring a zero-slope transition at the start and end of the sound.
- **Automatic Trial Advancement**: Support for configurable Inter-Trial Intervals (`itiMs`), allowing for high-throughput, automated experiment runs without manual clicking.
- **Configurable Focus Period**: Explicitly control the delay between clicking "Start" and the first stimulus onset via `readyDelayMs` (default 500ms), ensuring participants have time to focus before audio begins.
- **Scientific Control**: Configurable `allowReplay` flag to restrict or permit stimulus re-exposure, ensuring experimental rigor.
- **Graceful Cancellation**: Support for `Escape` key experiment cancellation with a design-system compliant confirmation modal. The cancellation logic is intelligently gated to only be active during the response phase to prevent accidental interruptions during stimulus playback.
- **Fully Reproducible Experiments**: `meta.seed` controls the FFT noise RNG, trial-order randomization, and all dynamic perturbation randomizations (roving levels, phase), ensuring every run is exactly reproducible.
- **Constrained Randomization**: Mark specific intervals as `"fixed": true` to exclude them from randomization. Combined with `"selectable": false`, you can create standard professional paradigms like **4I2AFC**, where intervals 1 and 4 are fixed non-responsive anchors. The UI always displays interval numbers on all buttons (including non-selectable ones) to maintain clear spatial orientation for the participant.
- **Advanced Roving & Randomization**: Apply interval-level global roving or component-level jitter across multiple physical dimensions. All perturbations support `RandomUniform` distributions and can target only the signal interval or `"all"` intervals for true roving. Omit the `targetFrequency` on any perturbation to apply it globally to all components in the stimulus:
  - **Level**: via `gain` (global) or `spectral_profile` (per-component).
  - **Frequency**: via `mistuning` for global pitch roving.
  - **Timing**: via `onset_asynchrony` for global onset roving.
  - **Phase**: via `phase_shift` for global phase roving.
  - **Modulation**: via `am_depth` for global AM depth roving.
- **Adaptive Staircase**: Full-featured `StaircaseController` supporting N-down/1-up rules, fast-start logic (`initialN`/`switchReversalCount`), dynamic step-size reduction on reversals, and standard reversal-point threshold averaging (with configurable `discardReversals`, defaulting to 4).
- **FFT-Based Noise Synthesis**: Lab-grade broadband noise generation in the frequency domain. Generates White, Pink ($1/f$), and Brown ($1/f^2$) spectra with perfectly sharp brick-wall band-limiting.
- **AM & FM Modulations**: Sinusoidal Amplitude and Frequency modulation support for both components and noise carriers, including adaptive `am_depth` perturbations.
- **Block-Based Architecture**: Group multiple experiment stages into a single session. Each block can have its own paradigm, stimuli, adaptive rules, and termination criteria (e.g., a fixed-level practice block followed by an adaptive test block).
- **Shared-Envelope Modulation**: Support for `sharedEnvelopeId` on noise modulators. This allows multiple noise bands to share a single, perfectly correlated modulation envelope, which is essential for studying Comodulation Masking Release (CMR).
- **FIR Filtered Noise**: A `filtered_noise` generator that accepts custom FIR coefficients. This allows for high-precision masking paradigms like **Notched Noise** masking to measure auditory filter shapes.
- **Binaural Temporal Precision**: Explicitly decouples fine-structure phase shifts (IPD) from gated stimulus onset shifts (True ITD), automatically managing buffer padding to prevent sample clipping. The engine follows a unified **Delay-based Convention**: positive values for both ITD and Onset Asynchrony represent a **Temporal Delay (Lag)**. For ITD, this shifts the sound AWAY from the targeted ear; for asynchrony, it delays the start of the targeted component.
- **Global Level Control**: Apply a master trim gain (`globalLevelDb`) to the entire trial stimulus. This occurs after per-generator synthesis but before final normalization, providing a clean way to adjust overall presentation levels while maintaining calibrated relative component ratios.
- **Interval-Specific Stimuli**: Use the `applyTo` field on any stimulus generator (`"target"`, `"reference"`, or `"all"`) to define complex scenes where sounds only play in specific intervals (e.g., adding a target tone to a noise masker only in the signal interval).
- **Multi-Layer Masking**: Stack an arbitrary array of independent stimulus generators (e.g., noise maskers and multi-component targets) into a single composite interval. Combined with `applyTo`, this enables clean, explicit modeling of Signal-in-Noise paradigms without architectural hacks.
- **Dynamic Participant Instructions**: Supply experiment-level and block-level metadata via `meta.summary` (sensory focus, e.g., "Select the higher pitch") and `meta.description` (welcoming guidance). Avoid technical jargon in participant-facing text.
- **Global & Block UI Control**: Configure UI visibility (e.g., `showCurrentValue`, `showTrialNumber`) either globally for the experiment or override them per-block for different experimental phases.
- **Dichotic Routing**: Route components independently to the left, right, or both ears, enabling Binaural Masking Level Difference (BMLD) and Spatial Release from Masking (SRM) paradigms.
- **Termination & Thresholding**: Configure exactly how and when an experiment ends (e.g., stopping after $N$ reversals or $M$ trials).
- **Hardware Calibration**: Apply log-frequency interpolated dB offsets to account for transducer frequency responses.
- **Runtime Perturbations**: Dynamically alter components (Mistuning, Spectral Profile, Onset Asynchrony, Phase Shift, AM Depth, ITD) based on the adaptive staircase value.
- **Data Export**: Download detailed trial history as a **JSON** file. The format include the exact numerical state of all random and adaptive perturbations for perfect mathematical reconstructability and advanced analysis (e.g., Berg 1990).

## Technical Implementation

- **Web Worker Synthesis**: Offloads heavy sample-by-sample calculations and FFT operations to a background thread, ensuring a stutter-free 60 fps UI and utilizing zero-copy Transferable objects for maximum memory efficiency.
- **Synchronized UI Feedback**: Interval buttons highlight in precise synchrony with audio stimuli by scheduling callbacks against the `AudioContext` hardware clock. This eliminates visual drift from garbage collection pauses and event-loop jitter.
- **Click-Free Synthesis**: The engine ensures every stimulus buffer concludes at a zero-crossing point, eliminating DC-offset clicks during rapid interval transitions or adaptive parameter changes.
- **Binaural Alignment**: Automatically manages buffer padding and sample-accurate offsets to keep stimuli phase-aligned across channels, even when applying differential delays or phase shifts.

## MCP Server Tools

| Tool | Description |
|------|-------------|
| `list_examples` | List all included example experiment names |
| `get_example_config` | Retrieve the full JSON config for a named example |
| `get_schema_reference` | Annotated documentation for every `ExperimentConfig` field — use this before building an experiment |
| `calc_frequencies` | Calculate component frequencies with linear, log, or ERB spacing |
| `calc_phases` | Calculate component phases (Sine, Schroeder+/-, or seeded Random) |
| `calc_amplitudes` | Calculate component levels in dB (Flat or accurate 3 dB/octave Pink Tilt) |
| `calc_itd` | Convert ITD in microseconds to `onsetDelayMs`, with equivalent IPD in degrees and phase-ambiguity warnings |
| `generate_harmonic_complex` | Generate a `multi_component` config for a harmonic complex with custom F0 and envelope |
| `generate_notched_noise` | Generate a `filtered_noise` config with FIR coefficients for specified notch widths |
| `calc_bmld_config` | Generate stimuli and perturbations for N0Spi or NpiS0 BMLD experiments |
| `evaluate_and_finalize_experiment` | Expert validation: per-block clipping check, reversal count, IPD ear-targeting check |

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

| Example | Key Paradigm | Sensory Target |
|---------|-------------|-----------|
| **1. Practice & Test** | Onboarding / 2AFC | "Higher Pitch" |
| **2. Intensity Discrim.** | 4I2AFC (Anchored) | "Louder Tone" |
| **3. Tone in Noise** | 3AFC Masking | "Beep in Noise" |
| **4. AM Detection** | 3AFC Modulation | "Wobbly Sound" |
| **5. ITD Discrim.** | Binaural (Microseconds) | "Shifted Right" |
| **6. Profile Analysis** | Spectral Shape Roving | "Different Color" |

## Limitations & Future Work

- **Result Aggregation**: The current export is per-session. Multi-session threshold averaging and participant management are outside the current scope.
