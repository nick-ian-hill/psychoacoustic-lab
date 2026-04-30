# Psychoacoustic Lab: Procedural Skills & Knowledge

This file provides the "heavy-duty" procedural knowledge required to reliably configure experiments. Use these rules and yardsticks to ensure scientific rigor.

## Tiered Tooling & Abstractions

Always prefer higher-level abstractions to ensure schema compliance and mathematical correctness:

*   **TIER 1: Orchestrators** (`generate_config_from_template`, `generate_batch_configs`): Use these to build entire experiments or condition batches in one shot.
*   **TIER 2: Component Generators** (`generate_stimulus_block`): The RECOMMENDED way to build custom stimuli safely. It handles internal math and ensures schema compliance.
*   **TIER 3: Primitives** (`calc_frequencies`, `calc_phases`, `calc_itd`): Low-level math utilities for manual overrides and precise component-level targeting.

## Architecture & Binaural Precision

*   **Temporal Convention (ITD & Asynchrony):** The platform follows a unified **Positive = Delay** convention. 
    *   **ITD:** A positive `deltaMicroseconds` delays the targeted ear (Lag), shifting the perceived image AWAY from that ear.
    *   **Asynchrony:** A positive `delayMs` in `onset_asynchrony` delays the start of the targeted component relative to others.
*   **IPD (Interaural Phase Difference):** Use `mode: 'fine_structure'`. The engine subtracts phase for positive values to maintain consistency with the delay model.
*   **Adaptive Linking:** If you use `{ "adaptive": true }` in any perturbation, you MUST define an `adaptive` configuration block.
*   **Precise Gain Logic:** All `gain` perturbations (roving + target) are summed into a single dB offset before synthesis. This eliminates double-counting while ensuring that roving levels do not "leak" between sound sources if `targetGeneratorIndex` is used.
*   **Binaural Alignment:** The engine automatically manages buffer padding and sample-accurate offsets to keep stimuli phase-aligned, even when applying differential delays.

## Human Auditory Thresholds (Empirical Yardsticks)

Base initial values and boundaries on these human limits, grounded in seminal JASA literature:

| Dimension | Threshold / Limit | Guardrail / Reference |
| :--- | :--- | :--- |
| **Absolute Detection** | Peaks at 1000–4000 Hz | Approaches 0 dB SPL. (Fletcher, 1940) |
| **Freq. Discrimination** | JND ≈ 0.16% (Weber fraction 0.0016) | JND for 2000 Hz is ~3.2 Hz. (Wier et al., 1977) |
| **Intensity Discrim.** | JND ≈ 1 dB | Near-miss to Weber's Law. (Jesteadt et al., 1977) |
| **ITD / IPD** | Threshold ≈ 10–11 µs | Binaural phase-locking ceases ~1.4 kHz. (Klumpp & Eady, 1956; Mills, 1958) |
| **Gap Detection** | 2–5 ms | For broadband noise. (Moore et al., 1988) |
| **AM Detection** | TMTF low-pass cut-off | ~50–60 Hz for broadband noise. (Viemeister, 1979) |
| **Masking / Tonotopy** | Energetic masking within ERB | Use "erb" for modeling. (Moore & Glasberg, 1983) |

## Methodological Paradigms

### Adaptive Staircases (n-down/1-up)
*   **Targeting:** 2-down/1-up targets the 70.7% point; 3-down/1-up targets the 79.4% point. (Levitt, 1971).
*   **Efficiency:** Adaptive methods are significantly more efficient than constant stimuli for threshold estimation. (Watson & Fitzhugh, 1990).
*   **Step Sizes:** Start large and systematically decrease (e.g., use `stepSizeInterval`) to balance speed and precision. (Jesteadt, 1980).
*   **Anchored Paradigms (4I2AFC):** For beginners, use fixed "anchor" intervals at the start and end of a sequence (e.g., `fixed: true`). By setting `selectable: false`, these intervals become non-clickable perceptual references, forcing the participant to choose between the valid middle alternatives.

### Binaural & Spatial Hearing
*   **BMLD:** Use phase inversion (SπN0) to measure Binaural Masking Level Differences. (Durlach, 1963).
*   **Duplex Theory:** Focus on ITD for frequencies < 1.5 kHz and ILD for > 1.5 kHz. (Mills, 1958).

### Spectral Profile Analysis
*   **Loudness Roving:** To prevent participants from using absolute energy cues, apply a uniform random `gain` perturbation (e.g., ±5 dB) across ALL intervals. (Green, 1988).
*   **Global Level Roving:** Omit `targetGeneratorIndex` to shift the entire interval's level while keeping Signal-to-Masker (SMR) ratios constant.
*   **Independent Jitter & Molecular Psychophysics:** By applying independent random `gain` perturbations to multiple components, researchers can estimate the **perceptual weight** of each component in the decision process (Berg, 1990). The platform's JSON export records these resolved offsets within the `trialState` metadata for every interval, enabling reverse-correlation or regression-based analysis.
*   **Profile Cues:** Listeners compare levels across frequency channels rather than absolute levels. (Green, Mason & Kidd, 1984).

### Temporal Processing
*   **Temporal Window:** The ear integrates power over a sliding window (roughly 10-20ms). (Moore et al., 1988; Plack & Moore, 1990).
*   **TMTF:** Measure AM detection thresholds across rates to map temporal resolution. (Viemeister, 1979).

## Verification & Finalization

1.  **Sensory Instructions:** Every experiment requires `meta.summary` (sensory focus, e.g., "Select the higher pitch") and `meta.description` (welcoming, non-technical). Avoid jargon like "mistuning" or "AM depth" in participant-facing text.
2.  **Clipping Check:** Always run `evaluate_and_finalize_experiment` to check for peak-level clipping.
3.  **Termination:** Use `reversals: 12` for adaptive tasks and `trials: N` for fixed-length tasks.
