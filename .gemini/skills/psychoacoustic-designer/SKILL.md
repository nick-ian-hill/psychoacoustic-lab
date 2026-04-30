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

## Human Auditory Thresholds (Empirical Yardsticks)

Base initial values and boundaries on these human limits to prevent unrealistic designs:

| Dimension | Threshold / Limit | Guardrail |
| :--- | :--- | :--- |
| **Absolute Detection** | Peaks at 1000–4000 Hz | Approaches 0 dB SPL in this range. |
| **Freq. Discrimination** | JND ≈ 0.16% (Weber fraction 0.0016) | JND for 2000 Hz is ~3.2 Hz. |
| **Intensity Discrim.** | JND ≈ 1 dB | For tones/noise at comfortable levels. |
| **ITD / IPD** | Threshold ≈ 10–11 µs | **Phase-locking limit:** Monoral ceases ~4-5 kHz; Binaural ceases ~1.4 kHz. Do not use TFS cues above 1.4 kHz. |
| **Freq. Range** | 20 Hz – 20,000 Hz | Avoid critical targets > 12 kHz for general populations. |
| **Gap Detection** | 2–5 ms | For broadband noise in normal-hearing adults. |
| **Masking / Tonotopy** | Energetic masking within ERB | Use "erb" spacing in `calc_frequencies` for physiological modeling. |

## Methodological Paradigms

### Adaptive Staircases (n-down/1-up)
*   **Targeting:** 2-down/1-up targets the 70.7% point; 3-down/1-up targets the 79.4% point.
*   **Step Sizes:** Start large and systematically decrease after early reversals (e.g., use `stepSizeInterval`).
*   **Step Types:**
    *   **Linear:** Use for additive units (e.g., dB).
    *   **Geometric:** Use for variables bounded by zero (e.g., percentage mistuning, AM depth, ITD in µs).

### Roving & Confounds
*   **Global Level Roving:** To prevent absolute loudness cues while keeping Signal-to-Masker (SMR) ratios constant, apply the `gain` rove without a `targetGeneratorIndex`. This shifts the entire interval's level.
*   **Independent Jitter & Molecular Psychophysics:** By applying independent random `gain` perturbations to multiple components, researchers can estimate the **perceptual weight** of each component in the decision process (Berg, 1990). The platform's JSON export records these resolved offsets within the `trialState` metadata for every interval, enabling reverse-correlation or regression-based analysis of observer efficiency in external tools like Python or R.

## Verification & Finalization

1.  **User Instructions:** Every experiment requires `meta.summary` (short, trial-time) and `meta.description` (long, help-time).
2.  **Clipping Check:** Always run `evaluate_and_finalize_experiment` to check for peak-level clipping when multiple components or positive gain perturbations are used.
3.  **Reversal Count:** Ensure at least 8-12 reversals are targeted for stable threshold estimation.
