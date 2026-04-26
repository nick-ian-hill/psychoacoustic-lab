# Psychoacoustic Lab

An advanced, flexible platform for designing and running psychoacoustic experiments. It combines a Web Audio synthesis engine with an MCP (Model Context Protocol) Server "Math Toolkit" to provide lab-grade acoustic precision and AI-assisted experiment generation.

## Architecture

The project is split into three main components:

1. **`shared/schema.ts`**: The source of truth. Defines Zod schemas for `ExperimentConfig`, including a highly flexible `MultiComponentGenerator` capable of modeling arbitrary acoustic scenes with explicit frequency, level, phase, and dichotic routing per component.
2. **`mcp-server`**: A "Math Toolkit" and Expert Advisor. It exposes tools to an AI agent to calculate complex arrays (e.g., log-spaced frequencies, Schroeder phases, pink noise tilts) and provides a final validation endpoint that warns about physical clipping risks and adaptive stability.
3. **`web-app`**: A complete frontend execution environment. It features a sleek UI for running adaptive staircase trials, and a high-performance **Web Worker** based audio engine that handles complex real-time synthesis without blocking the main thread.

## Features

- **Synchronized UI Feedback**: Visual highlighting of interval buttons in perfect sync with audio stimuli, providing clear feedback during multi-interval paradigms.
- **Automatic Trial Advancement**: Support for configurable Inter-Trial Intervals (`itiMs`), allowing for high-throughput, automated experiment runs without manual clicking.
- **Scientific Control**: Configurable `allowReplay` flag to restrict or permit stimulus re-exposure, ensuring experimental rigor.
- **Execution Loop UI**: A refined, focused dark-mode web interface to run experiments, supporting both built-in examples and custom `.json` configuration uploads.
- **Adaptive Staircase**: Integrated `Staircase` logic supporting N-down/1-up rules with dynamic step-size reductions on reversals.
- **FFT-Based Noise Synthesis**: Lab-grade broadband noise generation in the frequency domain. Supports White, Pink ($1/f$), and Brown ($1/f^2$) spectra with perfectly sharp "brick-wall" band-limiting.
- **AM & FM Modulations**: Sinusoidal Amplitude and Frequency modulation support for both components and noise carriers, including adaptive `am_depth` perturbations.
- **Web Worker Synthesis**: Offloads all heavy sample-by-sample calculations and FFT operations to a background thread, ensuring a stutter-free 60fps UI and utilizing zero-copy Transferable objects for maximum efficiency.
- **Binaural Temporal Precision**: Explicitly decouples fine-structure phase shifts (IPD) from gated stimulus onset shifts (True ITD), automatically managing complex buffer padding to prevent sample clipping.
- **Multi-Layer Masking**: Supports stacking an arbitrary array of independent stimulus generators (e.g., noise maskers and multi-component targets) into a single composite interval for complex BMLD paradigms.
- **Dynamic UX Instructions**: Supply experiment-specific UI instructions via `meta.instructions` (e.g., "Identify the higher pitch") to guide participants.
- **Dichotic Routing**: Support for routing components independently to the left, right, or both ears, enabling Binaural Masking Level Difference (BMLD) and Spatial Release from Masking (SRM) paradigms.
- **Hardware Calibration**: Apply log-frequency interpolated dB offsets to account for transducer frequency responses.
- **Runtime Perturbations**: Dynamically alter components (e.g., Mistuning, Spectral Profile, Onset Asynchrony, Phase Shift, AM Depth) based on the adaptive staircase value.

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
   The MCP Server can be launched via:
   ```bash
   cd mcp-server
   npm start
   ```

## Included Examples (`examples/examples.ts`)
- **Frequency Discrimination**: Classic psychophysical test.
- **Auditory Grouping**: Profile analysis with an asynchronous target.
- **Log-Spaced Detection**: Demonstrates the use of the MCP Math Toolkit.
- **IPD Discrimination (TFS)**: Assesses sensitivity to Temporal Fine Structure (TFS) using binaural phase shifts.
- **Spatial Release from Informational Masking (SRIM)**: Target is spatially separated from random informational maskers.
- **TEN Test**: Threshold Equalizing Noise test for identifying cochlear dead regions.
- **AM Detection**: Detect the presence of 8 Hz amplitude modulation on broadband noise.

## Limitations & Future Work

- **Broadband Noise Calibration**: Calibration is currently precise for pure-tone components via log-frequency interpolation. Applying calibration profiles accurately to broadband noise requires frequency-domain filtering/EQ rather than simple level offsets.
