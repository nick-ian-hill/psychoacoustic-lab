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

  // 1. Check if there is a fixed target defined. 
  // If so, it overrides any randomization (Fixed-target task).
  const fixedTargetIndex = paradigm.intervals.findIndex(int => int.fixed && int.condition === 'target');
  
  let targetIndex: number;

  if (fixedTargetIndex !== -1) {
    targetIndex = fixedTargetIndex;
  } else {
    // 2. Identify which intervals are allowed to be the target.
    // We exclude non-selectable intervals (markers) and fixed reference intervals (cues).
    const selectableIndices = paradigm.intervals
      .map((int, i) => (int.selectable !== false && !int.fixed ? i : -1))
      .filter(i => i !== -1);

    if (selectableIndices.length === 0) {
      throw new Error("Paradigm configuration error: No valid target interval candidates found.");
    }

    // 3. Pick the target interval
    if (paradigm.randomizeOrder === false) {
      targetIndex = selectableIndices[0];
    } else {
      targetIndex = selectableIndices[Math.floor(rng() * selectableIndices.length)];
    }
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
