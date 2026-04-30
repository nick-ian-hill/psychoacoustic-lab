import { AudioEngine } from './audio/engine';
import { StaircaseController } from './logic/staircase';
import { ExperimentConfigSchema } from '../../shared/schema';
import * as examples from '../../examples/examples';
import seedrandom from 'seedrandom';

const configSelect = document.getElementById('config-select') as HTMLSelectElement;
const customJsonGroup = document.getElementById('custom-json-group') as HTMLDivElement;
const customFileInput = document.getElementById('custom-file') as HTMLInputElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;

const setupArea = document.getElementById('setup-area') as HTMLDivElement;
const experimentArea = document.getElementById('experiment-area') as HTMLDivElement;

const statusBadge = document.getElementById('status-badge') as HTMLDivElement;
const playBtnContainer = document.getElementById('play-btn-container') as HTMLDivElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const responseButtonsContainer = document.getElementById('response-buttons-container') as HTMLDivElement;

let responseButtons: HTMLButtonElement[] = [];
let targetIntervalIndex = -1;
let lastTrialData: any = null; // Store the exact resolved stimuli for logging
let highlightTimeouts: any[] = [];
let isProcessingResponse = false;

const resultsArea = document.getElementById('results-area') as HTMLDivElement;
const selectionDescription = document.getElementById('selection-description') as HTMLDivElement;

const finalThreshold = document.getElementById('final-threshold') as HTMLParagraphElement;
const downloadResultsBtn = document.getElementById('download-results-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;


let engine: AudioEngine;
let staircase: StaircaseController;
let currentConfig: any;
let currentBlockIndex = 0;
let currentBlock: any;

// Seeded RNG for reproducible interval order randomization
let trialRng: () => number;

// Pre-render the next trial buffer to ensure precise ITI timing
let preRenderedTrial: Promise<{ buffer: AudioBuffer; intervalLengths: number[] }> | null = null;

/**
 * Pre-calculates the next trial's audio buffer and roving parameters.
 * This is called in the background while the participant is viewing feedback or
 * during the ITI to eliminate synthesis latency at playback time.
 */
async function prepareTrial() {
  const intervalsConfig = [...currentBlock.paradigm.intervals];

  // Use seeded RNG so trial order is reproducible from meta.seed
  if (currentBlock.paradigm.randomizeOrder) {
    // Only shuffle intervals that are not marked as 'fixed'
    const dynamicIndices = intervalsConfig
      .map((item, index) => item.fixed ? -1 : index)
      .filter(index => index !== -1);

    for (let i = dynamicIndices.length - 1; i > 0; i--) {
      const j = Math.floor(trialRng() * (i + 1));
      const idxI = dynamicIndices[i];
      const idxJ = dynamicIndices[j];
      [intervalsConfig[idxI], intervalsConfig[idxJ]] = [intervalsConfig[idxJ], intervalsConfig[idxI]];
    }
  }

  targetIntervalIndex = intervalsConfig.findIndex(i => i.condition === 'target');

  // Helper to resolve a perturbation parameter to a strict number
  const resolveParam = (val: any) => {
    if (typeof val === 'number') return val;
    if (val?.adaptive) return staircase.getCurrentValue();
    if (val?.type === 'uniform') return val.min + trialRng() * (val.max - val.min);
    return 0;
  };

  // Build trial data with fully resolved perturbations for perfect logging
  const trialData = intervalsConfig.map(interval => {
    const resolvedPerturbations: any[] = [];
    if (currentBlock.perturbations) {
      currentBlock.perturbations.forEach((p: any) => {
        const applyTo = p.applyTo || "target";
        if (applyTo === "all" || interval.condition === "target") {
          const rp = { ...p };
          if (rp.deltaDb !== undefined) rp.deltaDb = resolveParam(rp.deltaDb);
          if (rp.deltaPercent !== undefined) rp.deltaPercent = resolveParam(rp.deltaPercent);
          if (rp.delayMs !== undefined) rp.delayMs = resolveParam(rp.delayMs);
          if (rp.deltaDegrees !== undefined) rp.deltaDegrees = resolveParam(rp.deltaDegrees);
          if (rp.deltaDepth !== undefined) rp.deltaDepth = resolveParam(rp.deltaDepth);
          if (rp.deltaMicroseconds !== undefined) rp.deltaMicroseconds = resolveParam(rp.deltaMicroseconds);
          resolvedPerturbations.push(rp);
        }
      });
    }
    return {
      generators: currentBlock.stimuli.filter((g: any) => {
        const applyTo = g.applyTo || "all";
        if (applyTo === "all") return true;
        return applyTo === interval.condition;
      }),
      perturbations: resolvedPerturbations
    };
  });

  lastTrialData = trialData;

  return engine.renderTrial(
    trialData,
    currentBlock.paradigm.timing.isiMs,
    staircase?.getCurrentValue(),
    currentConfig.calibration,
    currentConfig.globalLevelDb
  );
}

// Global keydown handler handles both experiment responses and dropdown navigation
window.addEventListener('keydown', (e) => {
  const isDropdownOpen = customDropdown.classList && customDropdown.classList.contains('open');

  if (isDropdownOpen) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, optionsList.length - 1);
      updateHighlights();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlights();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectOption(highlightedIndex);
    } else if (e.key === 'Escape') {
      toggleDropdown(false);
    }
    return;
  }

  // Only handle if we are in the experiment area and buttons are enabled
  if (experimentArea.classList.contains('hidden')) return;
  if (responseButtons.length === 0 || responseButtons[0].disabled) return;

  // Handle '1'-'9' and Numpad '1'-'9'
  const keyMatch = e.key.match(/^[1-9]$/);
  const numpadMatch = e.code.match(/^Numpad([1-9])$/);

  const digit = keyMatch ? parseInt(keyMatch[0]) : (numpadMatch ? parseInt(numpadMatch[1]) : null);

  if (digit && digit <= responseButtons.length) {
    handleResponse(digit - 1);
    return;
  }

  // Handle Spacebar to trigger 'Play Next' if the button is enabled (manual mode)
  if (e.code === 'Space' && !playBtn.disabled) {
    e.preventDefault();
    playBtn.click();
  }
});

// ─── Custom Dropdown Logic ───────────────────────────────────────────────────
const customDropdown = document.getElementById('custom-dropdown') as HTMLDivElement;
const dropdownTrigger = document.getElementById('dropdown-trigger') as HTMLDivElement;
const dropdownOptions = document.getElementById('dropdown-options') as HTMLDivElement;
const selectedText = document.getElementById('selected-text') as HTMLSpanElement;
const optionsList = Array.from(dropdownOptions.querySelectorAll('.option')) as HTMLDivElement[];
let highlightedIndex = -1;

function toggleDropdown(show?: boolean) {
  const isCurrentlyOpen = customDropdown.classList.contains('open');
  const shouldOpen = show !== undefined ? show : !isCurrentlyOpen;

  if (shouldOpen) {
    customDropdown.classList.add('open');
    dropdownOptions.classList.remove('hidden');
    // Set initial highlight to the currently selected item
    highlightedIndex = optionsList.findIndex(opt => opt.classList.contains('selected'));
    updateHighlights();
  } else {
    customDropdown.classList.remove('open');
    dropdownOptions.classList.add('hidden');
    highlightedIndex = -1;
  }
}

function updateHighlights() {
  optionsList.forEach((opt, i) => {
    opt.classList.toggle('highlighted', i === highlightedIndex);
    if (i === highlightedIndex) {
      opt.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectOption(index: number) {
  if (index < 0 || index >= optionsList.length) return;
  const option = optionsList[index];
  const value = option.getAttribute('data-value')!;
  const text = option.textContent!;

  configSelect.value = value;
  configSelect.dispatchEvent(new Event('change'));

  selectedText.textContent = text;
  optionsList.forEach(opt => opt.classList.remove('selected'));
  option.classList.add('selected');
  updateSelectionDescription(value);
  toggleDropdown(false);
}

function updateSelectionDescription(value: string) {
  if (value === 'custom') {
    selectionDescription.classList.add('hidden');
    return;
  }
  const config = (examples as any)[`${value}Config`];
  if (config) {
    const text = config.meta.description || config.meta.summary || "";
    if (text) {
      selectionDescription.textContent = text;
      selectionDescription.classList.remove('hidden');
    } else {
      selectionDescription.classList.add('hidden');
    }
  }
}


dropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDropdown();
});

optionsList.forEach((option, i) => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    selectOption(i);
  });
});

window.addEventListener('click', () => toggleDropdown(false));



configSelect.addEventListener('change', () => {
  updateSelectionDescription(configSelect.value);
  if (configSelect.value === 'custom') {
    customJsonGroup.classList.remove('hidden');
  } else {
    customJsonGroup.classList.add('hidden');
  }
});

// Initialize description for default selection
updateSelectionDescription(configSelect.value);


startBtn.addEventListener('click', async () => {
  try {
    let rawConfig;
    if (configSelect.value === 'custom') {
      if (!customFileInput.files || customFileInput.files.length === 0) {
        alert("Please select a JSON file first.");
        return;
      }
      const file = customFileInput.files[0];
      const text = await file.text();
      rawConfig = JSON.parse(text);
    } else {
      rawConfig = (examples as any)[`${configSelect.value}Config`];
    }

    if (!rawConfig) {
      alert(`Configuration Error: Could not find configuration for '${configSelect.value}'.`);
      return;
    }

    const parseResult = ExperimentConfigSchema.safeParse(rawConfig);

    if (!parseResult.success) {
      alert("Invalid Configuration: \n" + JSON.stringify(parseResult.error.format(), null, 2));
      return;
    }

    currentConfig = parseResult.data;

    // Initialize Audio Engine
    if (engine) {
      await engine.close();
    }
    engine = new AudioEngine(currentConfig.meta.seed);

    // Initialize seeded RNG for reproducible interval-order randomization
    trialRng = seedrandom(currentConfig.meta.seed.toString());

    setupArea.classList.add('hidden');
    experimentArea.classList.remove('hidden');

    startBlock(0);

  } catch (e: any) {
    alert("Error loading experiment: " + e.message);
  }
});

async function startBlock(index: number) {
  currentBlockIndex = index;
  currentBlock = currentConfig.blocks[index];

  // Initialize StaircaseController (Trial Tracker)
  staircase = new StaircaseController(currentBlock.adaptive);

  // Set dynamic instructions from block/config
  const instructionEl = document.getElementById('instruction-text') as HTMLDivElement;

  if (instructionEl) {
    const summary = currentBlock.meta?.summary || currentConfig.meta.summary || "Select the target.";
    instructionEl.textContent = summary;
    const showInstructions = currentBlock.ui?.showInstructions ?? true;
    instructionEl.classList.toggle('hidden', !showInstructions);
  }

  // Generate dynamic response buttons based on the paradigm intervals
  responseButtonsContainer.innerHTML = '';
  responseButtons = [];
  currentBlock.paradigm.intervals.forEach((interval: any, index: number) => {
    const btn = document.createElement('button');
    btn.className = 'response-btn';
    
    if (interval.selectable === false) {
      btn.classList.add('non-selectable');
      btn.textContent = ''; // No number for cues/anchors
    } else {
      btn.textContent = `${index + 1}`;
      btn.addEventListener('click', () => handleResponse(index));
    }
    
    btn.disabled = true;
    responseButtonsContainer.appendChild(btn);
    responseButtons.push(btn);
  });

  playBtnContainer.classList.remove('hidden');
  playBtn.disabled = false;
  playBtn.classList.remove('playing');
  playBtn.textContent = index === 0 ? "Start Experiment" : `Start Block: ${currentBlock.id}`;

  resultsArea.classList.add('hidden');
  updateStatus();

  // Warm up AudioContext
  const buf = engine['ctx'].createBuffer(1, 1, engine['ctx'].sampleRate);
  const src = engine['ctx'].createBufferSource();
  src.buffer = buf;
  src.connect(engine['ctx'].destination);
  src.start();
}

/**
 * Renders and plays the next pre-rendered trial, optionally scheduling
 * the audio onset at a precise AudioContext timestamp.
 */
async function playNextTrial(scheduledTime?: number) {
  if (!preRenderedTrial) {
    preRenderedTrial = prepareTrial();
  }

  try {
    const { buffer, intervalLengths } = await preRenderedTrial;
    preRenderedTrial = null;

    clearFeedback();
    const { source, startTime } = await engine.playBuffer(buffer, scheduledTime);
    highlightIntervals(intervalLengths, startTime);

    source.onended = () => {
      playBtn.classList.remove('playing');
      playBtn.disabled = true;
    };
  } catch (e: any) {
    console.error(e);
    alert("Playback error: " + e.message);
    playBtn.classList.remove('playing');
    playBtn.textContent = "Error";
  }
}

playBtn.addEventListener('click', async () => {
  if (!engine) return;
  await engine.resume();

  playBtnContainer.classList.add('hidden');
  playBtn.disabled = true;
  playBtn.classList.add('playing');
  playBtn.textContent = "\u00A0";
  responseButtons.forEach(btn => btn.disabled = true);

  // Add a brief lead-in delay for the first trial
  if (!staircase || staircase.getHistory().length === 0) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await playNextTrial();
});

function handleResponse(responseIndex: number) {
  if (isProcessingResponse) return;
  isProcessingResponse = true;

  // Refresh audio lock within this user gesture
  if (engine) engine.resume().catch(() => { });

  responseButtons.forEach(b => b.disabled = true);

  playBtn.textContent = "\u00A0";
  const isCorrect = responseIndex === targetIntervalIndex;

  const btn = responseButtons[responseIndex];
  btn.classList.add(isCorrect ? 'correct' : 'incorrect');
  btn.blur();

  const feedbackMs = currentBlock.paradigm.timing.feedbackDurationMs ?? 400;
  const itiMs = currentBlock.paradigm.timing.itiMs ?? 1000;

  // 1. Process staircase logic if available
  if (staircase) {
    try {
      staircase.processResponse(isCorrect, {
        targetInterval: targetIntervalIndex + 1,
        response: responseIndex + 1,
        parameterValue: staircase.getCurrentValue(),
        unit: currentBlock.adaptive?.unit || "",
        trialState: lastTrialData
      });

      if (!staircase.isFinished(currentBlock.termination)) {
        preRenderedTrial = prepareTrial();
      }
    } catch (e) {
      console.error("Staircase update failed:", e);
      isProcessingResponse = false;
      playBtn.disabled = false;
      playBtn.textContent = "Error \u2014 check config";
      return;
    }
  } else {
    // Fixed trial count (e.g. practice)
    // We should track trials manually here or use a dummy staircase
    // For now, let's assume staircase is always there if adaptive is defined
    // If not, we should have a simple trial counter
  }

  setTimeout(() => {
    btn.classList.remove('correct', 'incorrect');

    const isBlockFinished = staircase ? staircase.isFinished(currentBlock.termination) : false;

    if (isBlockFinished) {
      if (currentBlockIndex < currentConfig.blocks.length - 1) {
        startBlock(currentBlockIndex + 1);
        isProcessingResponse = false;
      } else {
        endExperiment();
        isProcessingResponse = false;
      }
    } else {
      updateStatus();
      if (experimentArea.classList.contains('hidden')) return;
      const scheduledStartTime = engine.getTime() + itiMs / 1000;
      isProcessingResponse = false;
      playNextTrial(scheduledStartTime);
    }
  }, feedbackMs);
}


function highlightIntervals(lengths: number[], audioStartTime: number) {
  const sampleRate = engine['ctx'].sampleRate;
  const isiSec = (currentBlock.paradigm.timing.isiMs || 0) / 1000;
  const responseDelaySec = (currentBlock.paradigm.timing.responseDelayMs ?? 250) / 1000;

  const intervals: { start: number, end: number, btn: HTMLButtonElement }[] = [];
  let offset = 0;
  lengths.forEach((len, i) => {
    const duration = len / sampleRate;
    intervals.push({
      start: audioStartTime + offset,
      end: audioStartTime + offset + duration,
      btn: responseButtons[i]
    });
    offset += duration + isiSec;
  });

  const lastStimulusEndTime = intervals[intervals.length - 1].end;
  const enableButtonsAt = lastStimulusEndTime + responseDelaySec;

  const wallStart = performance.now();
  const totalDurationMs = (enableButtonsAt - audioStartTime) * 1000 + 800;
  let frameId: number;
  let buttonsEnabled = false;

  const update = () => {
    const now = engine.getTime();
    const wallNow = performance.now();
    let allFinished = (wallNow - wallStart > totalDurationMs);
    let activeIdx = -1;

    intervals.forEach((interval, idx) => {
      if (now >= interval.start && now <= interval.end) {
        activeIdx = idx;
      }
      if (now < interval.end + 0.1) allFinished = false;
    });

    intervals.forEach((interval, idx) => {
      const shouldBeActive = (idx === activeIdx);
      if (interval.btn.classList.contains('active') !== shouldBeActive) {
        interval.btn.classList.toggle('active', shouldBeActive);
      }
    });

    const wallClockTimeout = (wallNow - wallStart) > (totalDurationMs + 1000);
    if (!buttonsEnabled && (now >= enableButtonsAt || wallClockTimeout)) {
      responseButtons.forEach((btn, i) => {
        const intervalConfig = currentBlock.paradigm.intervals[i];
        const isEligible = !intervalConfig.fixed || intervalConfig.condition === 'target';
        btn.disabled = !isEligible;
      });
      buttonsEnabled = true;
    }

    if (now < enableButtonsAt && !wallClockTimeout) allFinished = false;

    if (!allFinished) {
      frameId = requestAnimationFrame(update);
      highlightTimeouts[0] = frameId;
    } else {
      clearFeedback();
    }
  };

  frameId = requestAnimationFrame(update);
  highlightTimeouts[0] = frameId;
}

function clearFeedback() {
  if (highlightTimeouts[0]) {
    cancelAnimationFrame(highlightTimeouts[0]);
  }
  highlightTimeouts = [];

  const container = document.querySelector('.container') as HTMLElement;
  if (container) {
    container.tabIndex = -1;
    container.focus();
  }

  responseButtons.forEach(btn => {
    btn.classList.remove('active');
    btn.blur();
    btn.style.borderColor = '';
    btn.style.color = '';
  });
}

function updateStatus() {
  if (!currentBlock) return;
  const ui = {
    ...(currentConfig.ui || {}),
    ...(currentBlock.ui || {})
  };
  const showTrialNumber = ui?.showTrialNumber ?? true;
  const showReversals = ui?.showReversals ?? false;
  const showCurrentValue = ui?.showCurrentValue ?? false;
  const showAverageThreshold = ui?.showAverageThreshold ?? false;

  const parts: string[] = [];

  if (showTrialNumber && staircase) {
    const trialNum = staircase.getHistory().length + 1;
    parts.push(`Trial ${trialNum}`);
  }

  if (showReversals && staircase) {
    const reversals = staircase.getReversalCount();
    const maxReversals = currentBlock.termination?.reversals ?? '?';
    parts.push(`Reversals: ${reversals}/${maxReversals}`);
  }

  if (showCurrentValue && staircase) {
    const val = staircase.getCurrentValue();
    const unit = currentBlock.adaptive?.unit || "";
    parts.push(`Value: ${val.toFixed(2)}${unit}`);
  }

  if (showAverageThreshold && staircase) {
    const discard = currentBlock.termination?.discardReversals ?? 4;
    const thresh = staircase.calculateThreshold(discard);
    const unit = currentBlock.adaptive?.unit || "";
    parts.push(`Threshold: ${thresh.toFixed(2)}${unit}`);
  }

  if (parts.length === 0) {
    statusBadge.classList.add('hidden');
  } else {
    statusBadge.classList.remove('hidden');
    statusBadge.textContent = parts.join(' | ');
  }
}


function endExperiment() {
  const info = document.querySelector('.experiment-info') as HTMLElement;
  const main = document.querySelector('.experiment-main') as HTMLElement;
  if (info) info.classList.add('hidden');
  if (main) main.classList.add('hidden');

  resultsArea.classList.remove('hidden');

  if (staircase) {
    const defaultDiscard = currentBlock.termination?.discardReversals ?? 4;
    const threshold = staircase.calculateThreshold(defaultDiscard);
    const unit = currentBlock.adaptive?.unit || "";
    finalThreshold.textContent = `Estimated Threshold: ${threshold.toFixed(2)}${unit ? ' ' + unit : ''}`;
  }
}

function buildDownloadData() {
  // For multi-block, we might want to download results for all blocks
  // For now, let's just keep it simple
  const threshold = staircase ? staircase.calculateThreshold(currentBlock.termination?.discardReversals ?? 4) : 0;
  const timestamp = new Date().toISOString();

  return {
    metadata: {
      timestamp,
      experimentName: currentConfig.meta.name,
      seed: currentConfig.meta.seed,
      threshold,
      unit: currentBlock.adaptive?.unit || "",
      actualSampleRate: engine['ctx'].sampleRate
    },
    config: currentConfig,
    history: staircase ? staircase.getHistory() : []
  };
}

downloadResultsBtn.addEventListener('click', () => {
  if (!currentConfig) return;
  const data = buildDownloadData();
  const content = JSON.stringify(data, null, 2);
  triggerDownload(content, 'application/json', `results_${currentConfig.meta.name.replace(/\s+/g, '_')}_${Date.now()}.json`);
});


function triggerDownload(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

// Auto-resume AudioContext when the tab becomes visible.
// This handles cases where the mobile OS suspends the context while the tab is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && engine) {
    engine.resume().catch(err => console.warn("[Main] Auto-resume failed (likely needs user gesture):", err));
  }
});

