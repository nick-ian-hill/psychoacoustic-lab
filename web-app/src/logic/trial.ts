import type { BlockConfig } from "../../../shared/schema.js";

/**
 * Generates the state for a single trial, including which interval is the target
 * and what perturbations should be applied to each interval.
 */
export function generateTrialState(
  block: BlockConfig,
  rng: () => number = Math.random
) {
  const paradigm = block.paradigm;

  // 1. Identify which intervals are allowed to be the target
  // We exclude intervals explicitly marked as non-selectable (anchors)
  const selectableIndices = paradigm.intervals
    .map((int, i) => (int.selectable !== false ? i : -1))
    .filter(i => i !== -1);

  if (selectableIndices.length === 0) {
    throw new Error("Paradigm configuration error: No selectable intervals found.");
  }

  // 2. Pick the target interval
  // In a standard m-AFC, this is randomized among the selectable intervals
  let targetIndex: number;
  if (paradigm.randomizeOrder === false) {
    // If randomization is disabled, we default to the first selectable interval
    // (This is rare in psychoacoustics but supported for specific calibration/demo tasks)
    targetIndex = selectableIndices[0];
  } else {
    targetIndex = selectableIndices[Math.floor(rng() * selectableIndices.length)];
  }

  // 3. Construct the perturbation list for each interval
  const intervalPerturbations = paradigm.intervals.map((interval, i) => {
    const isTarget = i === targetIndex;
    const perturbations: any[] = [];

    // Add fixed perturbations defined for this specific interval position
    if (interval.perturbations) {
      perturbations.push(...interval.perturbations);
    }

    // Add the "Target Perturbation" if this is the chosen target interval
    if (isTarget && paradigm.targetPerturbation) {
      perturbations.push(paradigm.targetPerturbation);
    }

    return perturbations;
  });

  return {
    targetIndex,
    intervalPerturbations
  };
}
