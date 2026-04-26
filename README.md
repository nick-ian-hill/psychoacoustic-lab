# Psychoacoustic Lab

An advanced, flexible platform for designing and running psychoacoustic experiments. It combines a Web Audio synthesis engine with an MCP (Model Context Protocol) Server "Math Toolkit" to provide lab-grade acoustic precision and AI-assisted experiment generation.

## Architecture

The project is split into three main components:

1. **`shared/schema.ts`**: The source of truth. Defines Zod schemas for `ExperimentConfig`, including a highly flexible `MultiComponentGenerator` capable of modeling arbitrary acoustic scenes with explicit frequency, level, phase, and dichotic routing per component.
2. **`mcp-server`**: A "Math Toolkit" and Expert Advisor. It exposes tools to an AI agent to calculate complex arrays (e.g., log-spaced frequencies, Schroeder phases, pink noise tilts, ITD/IPD conversions) and provides a final validation endpoint that checks for per-channel clipping risks, adaptive stability, calibration mismatches, and IPD configuration errors.
3. **`web-app`**: A complete frontend execution environment featuring a dark-mode UI for running adaptive staircase trials, and a high-performance **Web Worker**-based audio engine that handles complex real-time synthesis without blocking the main thread.

## Features

- **Synchronized UI Feedback**: Interval buttons highlight in precise synchrony with audio stimuli by scheduling `setTimeout` callbacks against the `AudioContext` clock (including hardware output latency), rather than the wall clock. This eliminates drift from GC pauses and event-loop jitter.
- **Automatic Trial Advancement**: Support for configurable Inter-Trial Intervals (`itiMs`), allowing for high-throughput, automated experiment runs without manual clicking.
- **Scientific Control**: Configurable `allowReplay` flag to restrict or permit stimulus re-exposure, ensuring experimental rigor.
- **Fully Reproducible Experiments**: `meta.seed` controls both the FFT noise RNG and the trial-order randomization, ensuring every run is exactly reproducible.
- **Adaptive Staircase**: Full-featured `StaircaseController` supporting N-down/1-up rules, fast-start logic (`initialN`/`switchReversalCount`), dynamic step-size reduction on reversals, and standard reversal-point threshold averaging (discarding the first 4 reversals).
- **FFT-Based Noise Synthesis**: Lab-grade broadband noise generation in the frequency domain. Supports White, Pink ($1/f$), and Brown ($1/f^2$) spectra with perfectly sharp brick-wall band-limiting.
- **AM & FM Modulations**: Sinusoidal Amplitude and Frequency modulation support for both components and noise carriers, including adaptive `am_depth` perturbations.
- **Web Worker Synthesis**: Offloads all heavy sample-by-sample calculations and FFT operations to a background thread, ensuring a stutter-free 60 fps UI and utilizing zero-copy Transferable objects for maximum efficiency.
- **Binaural Temporal Precision**: Explicitly decouples fine-structure phase shifts (IPD) from gated stimulus onset shifts (True ITD), automatically managing buffer padding to prevent sample clipping. The `ear` field on `phase_shift` perturbations ensures only the target channel is shifted, creating a genuine interaural phase difference.
- **Multi-Layer Masking**: Stack an arbitrary array of independent stimulus generators (e.g., noise maskers and multi-component targets) into a single composite interval for complex BMLD paradigms.
- **Dynamic Participant Instructions**: Supply experiment-specific instructions via `meta.instructions` (e.g., "Which interval contained the higher-pitched tone?") — displayed in the UI during the experiment.
- **Dichotic Routing**: Route components independently to the left, right, or both ears, enabling Binaural Masking Level Difference (BMLD) and Spatial Release from Masking (SRM) paradigms.
- **Hardware Calibration**: Apply log-frequency interpolated dB offsets to multi-component generators to account for transducer frequency responses.
- **Runtime Perturbations**: Dynamically alter components (Mistuning, Spectral Profile, Onset Asynchrony, Phase Shift, AM Depth) based on the adaptive staircase value.
- **Data Export**: Download trial history as `.txt` (human-readable) or `.csv` (analysis-ready, with `trial`, `parameter_value`, `correct`, `is_reversal` columns).

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
| `evaluate_and_finalize_experiment` | Expert validation: per-channel clipping check, reversal count, calibration+noise warnings, IPD ear-targeting check |

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

## Included Examples (`examples/examples.ts`)

All examples include participant-facing `meta.instructions` displayed in the UI during the experiment.

| Example | Key Paradigm | Literature |
|---------|-------------|-----------|
| **Frequency Discrimination** | 3-down/1-up mistuning threshold | Classic psychophysics |
| **Auditory Grouping** | Profile analysis with onset-asynchrony lead target | Hill & Bailey |
| **Log-Spaced Detection** | Spectral profile with MCP-calculated log-spaced complex | — |
| **IPD Discrimination (TFS)** | Binaural phase shift threshold; sensitive to hidden hearing loss | Moore (2014); Prendergast et al. (2017) |
| **Spatial Release from Informational Masking** | Dichotic target vs. co-located maskers | Kidd Jr et al. (2016); Gallun et al. (2013) |
| **TEN Test** | Tone-in-noise detection for cochlear dead regions | Moore et al. (2000) |
| **AM Detection** | 8 Hz amplitude modulation depth threshold | Viemeister (1979) |

## Limitations & Future Work

- **Broadband Noise Calibration**: The calibration profile applies log-frequency interpolated dB offsets to `multi_component` generators only. Broadband `noise` generators are **not** corrected by calibration profiles; accurate noise-level calibration requires frequency-domain EQ applied externally. The MCP `evaluate_and_finalize_experiment` tool warns when a calibration profile is combined with noise generators.
- **3AFC / Probe-Signal Paradigms**: The schema supports `3AFC` and `Probe-Signal` paradigm types, but the UI currently only renders two interval response buttons. These paradigm types require a UI extension to add a third button.
- **Result Aggregation**: The current export is per-session. Multi-session threshold averaging and participant management are outside the current scope.
