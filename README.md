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

### AI Agent Workspace Requirements (For Researchers)

To empower your AI agent (Antigravity, Claude, etc.) with expert psychoacoustic knowledge and experiment design capabilities, you must provide it with the specialized context files found in this repository.

1. **Include the `.gemini/` folder**: Copy this folder to the root of your experimental workspace. It contains the "Empirical Yardsticks" and procedural knowledge needed for scientifically grounded designs.
2. **Setup `GEMINI.md`**: 
   - Copy `mcp-server/GEMINI.md` from this repository.
   - Place it at the **root of your workspace** and rename it to `GEMINI.md`. 
   - *(Note: In this repository, this file is stored inside `mcp-server/` to avoid collision with the project's internal maintenance instructions.)*

Once these files are in your workspace root, the agent will automatically adopt the **Psychoacoustic Lab Assistant** role, allowing it to brainstorm paradigms, validate parameters against literature, and generate schema-compliant configurations.

*(Developers maintaining this codebase should instead refer to the root `GEMINI.md` for engineering standards.)*

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
2. **`mcp-server`**: A "Math Toolkit" and Expert Advisor. Includes **Specialized Stimulus Utilities** for generating complex configurations like notched noise, harmonic complexes, and BMLD presets. It provides a final validation endpoint that checks for per-block clipping risks, adaptive stability, calibration mismatches, and IPD configuration errors across all blocks. High-level procedural guidance for experiment design is provided in `mcp-server/GEMINI.md` and the `.gemini/skills/` directory.
3. **`web-app`**: A complete frontend execution environment. The UI provides per-block metadata and instructions, while the **Web Worker**-based audio engine handles advanced synthesis like FIR filtering and correlated noise modulation.

## Features

- **Raised Cosine Ramps**: Support for both Linear and Raised Cosine (Hann) onset/offset ramps. Raised Cosine ramps provide the cleanest possible spectrum by ensuring a zero-slope transition at the start and end of the sound.
- **Automatic Trial Advancement**: Support for configurable Inter-Trial Intervals (`itiMs`), allowing for high-throughput, automated experiment runs without manual clicking.
- **Configurable Focus Period**: Explicitly control the delay between clicking "Start" and the first stimulus onset via `readyDelayMs` (default 500ms), ensuring participants have time to focus before audio begins.
- **Scientific Control**: Configurable `allowReplay` flag to restrict or permit stimulus re-exposure, ensuring experimental rigor.
- **Graceful Cancellation**: Support for `Escape` key experiment cancellation with a design-system compliant confirmation modal. The cancellation logic is intelligently gated to only be active during the response phase to prevent accidental interruptions during stimulus playback.
- **Flexible Seeding & Sequence Reproducibility**: Support for optional experiment-level and block-level seeds:
  - **Optional**: Omit the seed for random-by-default sessions (perfect for onboarding).
  - **Block-Level**: Assign specific seeds to individual blocks (e.g., for a fixed practice phase).
  - **Sequence Control**: The order of randomized block groups is fully deterministic based on the master seed. The actual seed used is always recorded in the results metadata.
  - **Lifecycle Events**: Detailed programmatic hooks for integration: `{ threshold, results, actualSeed, presentationOrder, runIndex }`.
- **Advanced Block Sequencing**: Group multiple experiment stages into a single session. Each block can have its own paradigm, stimuli, adaptive rules, and termination criteria.
  - **Repetitions**: Run specific blocks or groups multiple times.
  - **Hierarchical Groups**: Nest blocks within groups to create complex structures (e.g., Practice → [Randomized Experimental Blocks]).
  - **Run Tracking**: Results explicitly record `runIndex`, `presentationOrder`, and start/end ISO timestamps for every block instance.
- **Anchored Paradigms (4I2AFC):** Useful for training, but also for experiments where the detection cue is complex or difficult to articulate. By setting the first and last intervals as fixed (`fixed: true`) and non-selectable (`selectable: false`), you provide stable perceptual "anchors" that help the participant maintain a consistent internal reference. The UI always displays interval numbers (1, 2, 3, 4) to maintain clear spatial orientation, even if some intervals are not selectable.
- **Advanced Roving & Randomization**: Apply interval-level global roving or component-level jitter across multiple physical dimensions. All perturbations support `RandomUniform` distributions and can target only the signal interval or `"all"` intervals for true roving. Omit the `stimulusIndex` to apply a perturbation to all sound sources in an interval, or omit `targetFrequency` to apply it to all components within a specific complex stimulus:
  - **Level**: via `gain` (global) or `spectral_profile` (per-component).
  - **Frequency**: via `mistuning` for global pitch roving.
  - **Timing**: via `onset_asynchrony` for global onset roving.
  - **Phase**: via `phase_shift` for global phase roving.
  - **Modulation**: via `am_depth` for global AM depth roving.
- **Adaptive Staircase**: Full-featured `StaircaseController` supporting N-down/1-up rules, fast-start logic (`initialN`/`switchReversalCount`), dynamic step-size reduction on reversals, and standard reversal-point threshold averaging (with configurable `discardReversals`, defaulting to 4).
- **FFT-Based Noise Synthesis**: Lab-grade broadband noise generation in the frequency domain. Generates White, Pink ($1/f$), and Brown ($1/f^2$) spectra with perfectly sharp brick-wall band-limiting.
- **AM & FM Modulations**: Sinusoidal Amplitude and Frequency modulation support for both components and noise carriers, including adaptive `am_depth` perturbations.
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
- **Automatic Backup & Recovery**: Optional `autoSave` mode that incrementally backs up results to `localStorage` after every block, allowing participants to resume from where they left off after a crash or accidental exit.
- **Mobile-Friendly Exit**: Configurable `show-quit` option to display a visible "Quit" button, essential for discoverability on touch devices.
- **Hardware Calibration**: Apply log-frequency interpolated dB offsets to account for transducer frequency responses.
- **Runtime Perturbations**: Dynamically alter components (Mistuning, Spectral Profile, Onset Asynchrony, Phase Shift, AM Depth, ITD) based on the adaptive staircase value.
- **Data Export**: Download detailed trial history as a **JSON** file. Supports the modern **File System Access API** for professional "Save As" workflows, with automatic fallbacks for older browsers. The format includes the exact numerical state of all random and adaptive perturbations for perfect mathematical reconstructability and advanced analysis.

## Scientific Validation & Testing

The Psychoacoustic Lab includes a rigorous suite of **70+ automated scientific audits** to ensure experimental integrity. These tests verify the mathematical accuracy of the audio engine and the reliability of the adaptive logic.

### 🧪 Key Validation Laboratories:
- **Audio Synthesis**: Verified sample-accurate ITD, phase-accurate modulation (AM/FM), and spectral noise slopes (-3dB/-6dB).
- **Adaptive Logic**: Verified staircase convergence, boundary enforcement, and reversal-point threshold averaging.
- **Binaural Precision**: Verified Schroeder phase relationships, crest factors, and sub-sample temporal alignment.
- **Hardware Independence**: Verified bit-identical output across 44.1kHz and 48kHz sample rates.
- **Robot Observer**: Monte Carlo simulations using logistic psychometric functions to validate that the staircase correctly tracks simulated "human" thresholds.

### 🚀 Running the Suite:
```bash
cd web-app
npm run test       # Run all audits in headless mode
npm run test:ui    # Open the interactive testing dashboard
```

## Integration & Embedding

The Psychoacoustic Lab is designed to be highly portable. You can build the web-app as a standalone **Web Component** and embed it into any website or CMS (like WordPress or a personal blog) with a single script tag.

See the [Integration Guide](integration_guide.md) for full instructions on building and embedding the portable components:

- **`<psychoacoustic-runner>`**: **The Researcher's Choice.** A minimal, logic-only runner for building custom experiment portals. Supports all features including `autoSave` backups.
- **`<psychoacoustic-app>`**: **Turnkey Lab & Demo.** A complete "all-in-one" UI with built-in examples. **Note:** The demo app is **stateless** and has `autoSave` disabled by default to ensure a clean experience for every visitor.

Both components support **CSS Custom Properties (Variables)**, allowing you to seamlessly theme the lab (colors, fonts, radius) to match your host website.

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

## Included Examples

The laboratory includes several classic paradigms to help you get started. You can browse the full collection in [`examples/examples.ts`](examples/examples.ts) or use the following standalone JSON templates for your own research:

- [**Tone in Noise**](examples/tone_in_noise.json): Classic 3AFC detection task using noise maskers.
- [**Relative Frequency Discrimination**](examples/relative_freq_discrimination.json): Advanced multi-block study comparing harmonic vs. inharmonic complexes.

| Example | Key Paradigm | Sensory Target |
|---------|-------------|-----------|
| **1. Pitch Discrimination** | Onboarding / 2AFC | "Higher Pitch" |
| **2. Intensity Discrimination** | 4I2AFC (Anchored) | "Louder Tone" |
| **3. Tone in Noise** | 3AFC Masking | "Beep in Noise" |
| **4. AM Detection** | 3AFC Modulation | "Wobbly Sound" |
| **5. ITD Discrimination** | Binaural (Microseconds) | "Shifted Right" |
| **6. Profile Analysis** | Spectral Shape Roving | "Different Color" |

## Limitations & Future Work

- **Result Aggregation**: The current export is per-session. Multi-session threshold averaging and participant management are outside the current scope.
