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
*   **Perturbation Summation:** Multiple `gain` perturbations targeting the same sound source (e.g., combining an adaptive signal level with a random level rove) are summed before synthesis. Use `stimulusIndex` to isolate perturbations to specific sound sources within an interval.
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
*   **Anchored Paradigms (4I2AFC):** Useful for training, but also for experiments where the detection cue is complex or difficult to articulate. By setting the first and last intervals as fixed (`fixed: true`) and non-selectable (`selectable: false`), you provide stable perceptual "anchors" that help the participant maintain a consistent internal reference. The UI always displays interval numbers (1, 2, 3, 4) to maintain clear spatial orientation, even if some intervals are not selectable.

### Binaural & Spatial Hearing
*   **BMLD:** Use phase inversion (SπN0) to measure Binaural Masking Level Differences. (Durlach, 1963).
*   **Duplex Theory:** Focus on ITD for frequencies < 1.5 kHz and ILD for > 1.5 kHz. (Mills, 1958).

### Spectral Profile Analysis
*   **Loudness Roving:** To prevent participants from using absolute energy cues, apply a uniform random `gain` perturbation (e.g., ±5 dB) across ALL intervals. (Green, 1988).
*   **Global Level Roving:** Omit `stimulusIndex` to shift all sound sources in the interval simultaneously, maintaining relative Signal-to-Masker (SMR) ratios while roving absolute levels.
*   **Independent Jitter & Molecular Psychophysics:** By applying independent random `gain` perturbations to multiple components, researchers can estimate the **perceptual weight** of each component in the decision process (Berg, 1990). The platform's JSON export records these resolved offsets within the `trialState` metadata for every interval, enabling reverse-correlation or regression-based analysis.
*   **Profile Cues:** Listeners compare levels across frequency channels rather than absolute levels. (Green, Mason & Kidd, 1984).
*   **Frequency Roving:** Control absolute frequency cues in relative relationship tasks (harmonicity, spectral shape) by roving the fundamental frequency or center frequency across intervals.
*   **Phase Roving:** Prevent temporal peak cues in harmonic complexes by randomizing starting phases. Use `calc_phases` with `random` type.

### Temporal Processing
*   **Temporal Window:** The ear integrates power over a sliding window (roughly 10-20ms). (Moore et al., 1988; Plack & Moore, 1990).
*   **TMTF:** Measure AM detection thresholds across rates to map temporal resolution. (Viemeister, 1979).

### Advanced Detection & Molecular Analysis
*   **Probe-Signal Paradigm:** Use the `probe` condition to present occasional unexpected signals. The engine tags these in the results, allowing researchers to measure the "attentional filter" (detection of expected vs. unexpected frequencies). (Green & Swets, 1966).
*   **Perceptual Anchors & Distractors:** Use `selectable: false` to provide anchors (fixed reference tones) that help the target "stand out" by grounding the participant's internal reference. This is also useful for adding distractors that influence the decision process but aren't valid response alternatives.
*   **Data Recording:** Every trial's JSON export includes the `trialState` for **all** intervals. This includes the exact resolved dB offsets of every jittered component (even in non-selectable intervals), enabling reverse-correlation analysis to see how "decision noise" correlates with participant responses (Berg, 1990).

## Verification & Finalization

1.  **Sensory Instructions:** Every experiment requires `meta.summary` (sensory focus, e.g., "Select the higher pitch") and `meta.description` (welcoming, non-technical). Avoid jargon like "mistuning" or "AM depth" in participant-facing text.
2.  **Timing Precision:** Use `readyDelayMs` (default 500ms) to provide a focus period after clicking "Start". For expert listeners, a short and consistent `itiMs` (e.g., 800-1000ms) helps maintain a high testing throughput and a stable "attentional state" throughout the block.
3.  **Clipping Check:** Always run `evaluate_and_finalize_experiment` to check for peak-level clipping.
4.  **Termination:** Use `reversals: 12` for adaptive tasks and `trials: N` for fixed-length tasks. Note that these can be combined (e.g., `reversals: 12` and `trials: 60`) to prevent extremely long sessions if a participant fails to converge. If used, the exclusion of such "timeout" blocks from the final analysis should be decided upfront to prevent selection bias.
