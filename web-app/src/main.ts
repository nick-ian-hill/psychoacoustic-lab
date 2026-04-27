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
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const responseButtonsContainer = document.getElementById('response-buttons-container') as HTMLDivElement;
let responseButtons: HTMLButtonElement[] = [];
let targetIntervalIndex = -1;
let lastTrialData: any = null; // Store the exact resolved stimuli for logging
let highlightTimeouts: any[] = [];

const resultsArea = document.getElementById('results-area') as HTMLDivElement;
const finalThreshold = document.getElementById('final-threshold') as HTMLParagraphElement;
const downloadResultsBtn = document.getElementById('download-results-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;

let engine: AudioEngine;
let staircase: StaircaseController;
let currentConfig: any;
// Seeded RNG for reproducible interval order randomization
let trialRng: () => number;

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
  toggleDropdown(false);
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
  if (configSelect.value === 'custom') {
    customJsonGroup.classList.remove('hidden');
  } else {
    customJsonGroup.classList.add('hidden');
  }
});

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

    const parseResult = ExperimentConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      alert("Invalid Configuration: \n" + JSON.stringify(parseResult.error.format(), null, 2));
      return;
    }

    currentConfig = parseResult.data;

    // This runner requires an adaptive staircase. Block non-adaptive configs early
    // rather than crashing silently when a response button is clicked.
    if (!currentConfig.adaptive || currentConfig.adaptive.type !== 'staircase') {
      alert("Configuration Error: This runner requires an 'adaptive' staircase block. Non-adaptive (method of constant stimuli) paradigms are not yet supported.");
      return;
    }

    // Initialize Audio Engine
    engine = new AudioEngine(currentConfig.audio.sampleRate, currentConfig.meta.seed);

    // Initialize StaircaseController (the full-featured implementation)
    if (currentConfig.adaptive && currentConfig.adaptive.type === 'staircase') {
      staircase = new StaircaseController(currentConfig.adaptive);
    }

    // Initialize seeded RNG for reproducible interval-order randomization
    trialRng = seedrandom(currentConfig.meta.seed.toString());

    setupArea.classList.add('hidden');
    experimentArea.classList.remove('hidden');

    // Set dynamic instructions from config
    const instructionEl = document.getElementById('instruction-text');
    if (instructionEl) {
      instructionEl.textContent = currentConfig.meta.instructions || "Listen carefully to each interval and select the one that contains the target.";
      // Default to true if property is missing
      const showInstructions = currentConfig.ui?.showInstructions ?? true;
      instructionEl.classList.toggle('hidden', !showInstructions);
    }

    // Generate dynamic response buttons based on the paradigm intervals
    responseButtonsContainer.innerHTML = '';
    responseButtons = [];
    currentConfig.paradigm.intervals.forEach((_: any, index: number) => {
      const btn = document.createElement('button');
      btn.className = 'response-btn';
      btn.textContent = `Interval ${index + 1}`;
      btn.disabled = true;
      btn.addEventListener('click', () => handleResponse(index));
      responseButtonsContainer.appendChild(btn);
      responseButtons.push(btn);
    });

    updateStatus();

    // Warm up AudioContext (requires user gesture to unlock)
    const buf = engine['ctx'].createBuffer(1, 1, 44100);
    const src = engine['ctx'].createBufferSource();
    src.buffer = buf;
    src.connect(engine['ctx'].destination);
    src.start();

  } catch (e: any) {
    alert("Error loading experiment: " + e.message);
  }
});

playBtn.addEventListener('click', async () => {
  if (!engine || !staircase) return;
  await engine.resume();

  // Always hide play button after first click as we are always in automated mode
  playBtn.classList.add('hidden');
  
  playBtn.disabled = true;
  playBtn.classList.add('playing');
  playBtn.textContent = "\u00A0";
  responseButtons.forEach(btn => btn.disabled = true);

  // Add a brief lead-in delay for the first trial to allow participant preparation.
  // We keep this short (200ms) to prevent the mobile "User Gesture" from expiring.
  if (staircase.getHistory().length === 0) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  try {
    const intervalsConfig = [...currentConfig.paradigm.intervals];

    // Use seeded RNG so trial order is reproducible from meta.seed
    if (currentConfig.paradigm.randomizeOrder) {
      for (let i = intervalsConfig.length - 1; i > 0; i--) {
        const j = Math.floor(trialRng() * (i + 1));
        [intervalsConfig[i], intervalsConfig[j]] = [intervalsConfig[j], intervalsConfig[i]];
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
      // Create a fresh set of resolved perturbations for this specific interval
      const resolvedPerturbations: any[] = [];
      
      if (currentConfig.perturbations) {
        currentConfig.perturbations.forEach((p: any) => {
          const applyTo = p.applyTo || "target";
          if (applyTo === "all" || interval.condition === "target") {
            const rp = { ...p }; // Shallow copy
            if (rp.deltaDb !== undefined) rp.deltaDb = resolveParam(rp.deltaDb);
            if (rp.deltaPercent !== undefined) rp.deltaPercent = resolveParam(rp.deltaPercent);
            if (rp.delayMs !== undefined) rp.delayMs = resolveParam(rp.delayMs);
            if (rp.deltaDegrees !== undefined) rp.deltaDegrees = resolveParam(rp.deltaDegrees);
            if (rp.deltaDepth !== undefined) rp.deltaDepth = resolveParam(rp.deltaDepth);
            resolvedPerturbations.push(rp);
          }
        });
      }

      // We attach the resolved perturbations directly to the generator definition
      // so the worker doesn't have to guess, and so we can log exactly what was played.
      return {
        generators: currentConfig.stimuli,
        perturbations: resolvedPerturbations
      };
    });
    
    lastTrialData = trialData;

    const { buffer, intervalLengths } = await engine.renderTrial(
      trialData,
      currentConfig.paradigm.timing.isiMs,
      staircase.getCurrentValue(),
      currentConfig.calibration,
      currentConfig.globalLevelDb
    );

    // Play and capture AudioContext startTime for synchronized highlighting
    clearFeedback();
    const { source, startTime } = await engine.playBuffer(buffer);
    highlightIntervals(intervalLengths, startTime);

      source.onended = () => {
        playBtn.classList.remove('playing');
        // In automated mode, we disable the play button immediately after playback ends
        // to prevent manual replays while waiting for a participant response.
        playBtn.disabled = true;
      };
  } catch (e: any) {
    console.error(e);
    alert("Playback error: " + e.message);
    playBtn.classList.remove('playing');
    playBtn.textContent = "Error";
  }
});

function handleResponse(responseIndex: number) {
  // 1. IMMEDIATELY disable all buttons to force focus release on mobile
  responseButtons.forEach(b => b.disabled = true);
  
  playBtn.textContent = "\u00A0";
  const isCorrect = responseIndex === targetIntervalIndex;

  // Flash correct/incorrect feedback on the chosen button
  const btn = responseButtons[responseIndex];
  btn.classList.add(isCorrect ? 'correct' : 'incorrect');
  btn.blur(); // Remove focus border

  setTimeout(() => {
    btn.classList.remove('correct', 'incorrect');

    staircase.processResponse(isCorrect, {
      targetInterval: targetIntervalIndex + 1,
      response: responseIndex + 1,
      parameterValue: staircase.getCurrentValue(),
      unit: currentConfig.adaptive.unit || "",
      trialState: lastTrialData
    });

    if (staircase.isFinished(currentConfig.termination)) {
      endExperiment();
    } else {
      updateStatus();
      responseButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.remove('active', 'correct', 'incorrect');
      });

      const itiMs = currentConfig.paradigm.timing.itiMs;
      playBtn.textContent = "\u00A0"; // Clear text but maintain button height
      playBtn.disabled = true;
      setTimeout(() => {
        if (experimentArea.classList.contains('hidden')) return;
        playBtn.disabled = false;
        playBtn.click();
      }, itiMs);
    }
  }, currentConfig.paradigm.timing.feedbackDurationMs);
}

/**
 * Highlights each interval button in precise synchrony with the audio.
 * Uses AudioContext.currentTime as the reference clock, accounting for
 * hardware output latency, rather than unreliable wall-clock setTimeout drift.
 */
function highlightIntervals(lengths: number[], audioStartTime: number) {
  const sampleRate = currentConfig.audio.sampleRate || 44100;
  const isiSec = (currentConfig.paradigm.timing.isiMs || 0) / 1000;
  const responseDelaySec = (currentConfig.paradigm.timing.responseDelayMs ?? 250) / 1000;
  
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
  // Ensure the loop runs until at least after the buttons are enabled
  const totalDurationMs = (enableButtonsAt - audioStartTime) * 1000 + 800; 
  let frameId: number;
  let buttonsEnabled = false;

  const update = () => {
    const now = engine.getTime();
    const wallNow = performance.now();
    let allFinished = (wallNow - wallStart > totalDurationMs);
    let activeIdx = -1;

    // 1. Determine which interval is currently active
    intervals.forEach((interval, idx) => {
      if (now >= interval.start && now <= interval.end) {
        activeIdx = idx;
      }
      if (now < interval.end + 0.1) allFinished = false;
    });

    // 2. Update highlight classes
    intervals.forEach((interval, idx) => {
      const shouldBeActive = (idx === activeIdx);
      if (interval.btn.classList.contains('active') !== shouldBeActive) {
        interval.btn.classList.toggle('active', shouldBeActive);
      }
    });

    // 3. Reliable response enablement: check AudioContext time against enableButtonsAt.
    // This is much more precise than source.onended + setTimeout.
    if (!buttonsEnabled && now >= enableButtonsAt) {
      responseButtons.forEach(btn => btn.disabled = false);
      buttonsEnabled = true;
    }
    
    // Ensure we don't stop the loop until buttons are enabled
    if (now < enableButtonsAt) allFinished = false;

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
  // Cancel the rAF highlight loop. Note: clearTimeout/clearInterval are no-ops on
  // rAF frame IDs (different ID spaces) — cancelAnimationFrame is the correct call.
  if (highlightTimeouts[0]) {
    cancelAnimationFrame(highlightTimeouts[0]);
  }
  highlightTimeouts = [];

  // 2. Focus Trap Reset: Pull focus away from buttons to the background
  const container = document.querySelector('.container') as HTMLElement;
  if (container) {
    container.tabIndex = -1;
    container.focus();
    container.blur();
  }

  // 3. Clear all visual classes and inline styles
  responseButtons.forEach(btn => {
    btn.classList.remove('active', 'correct', 'incorrect');
    btn.style.borderColor = '';
    btn.style.color = '';
  });
}

// Response event listeners are attached dynamically during initialization

function updateStatus() {
  const ui = currentConfig.ui;
  const showTrialNumber = ui?.showTrialNumber ?? true;
  const showReversals = ui?.showReversals ?? true;
  const showCurrentValue = ui?.showCurrentValue ?? false;
  const showAverageThreshold = ui?.showAverageThreshold ?? false;

  const parts: string[] = [];

  if (showTrialNumber) {
    const trialNum = staircase.getHistory().length + 1;
    parts.push(`Trial ${trialNum}`);
  }

  if (showReversals) {
    const reversals = staircase.getReversalCount();
    const maxReversals = currentConfig.termination.reversals ?? '?';
    parts.push(`Reversals: ${reversals}/${maxReversals}`);
  }

  if (showCurrentValue) {
    const val = staircase.getCurrentValue();
    const unit = currentConfig.adaptive?.unit || "";
    parts.push(`Value: ${val.toFixed(2)}${unit}`);
  }

  if (showAverageThreshold) {
    const discard = currentConfig.termination?.discardReversals ?? 4;
    const thresh = staircase.calculateThreshold(discard);
    const unit = currentConfig.adaptive?.unit || "";
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
  playBtn.classList.add('hidden');
  responseButtons.forEach(btn => btn.classList.add('hidden'));
  statusBadge.classList.add('hidden');
  document.getElementById('instruction-text')?.classList.add('hidden');

  resultsArea.classList.remove('hidden');

  // Use reversal-averaging
  const defaultDiscard = currentConfig.termination.discardReversals ?? 4;
  const threshold = staircase.calculateThreshold(defaultDiscard);
  const unit = currentConfig.adaptive.unit || "";
  finalThreshold.textContent = `Estimated Threshold: ${threshold.toFixed(2)}${unit ? ' ' + unit : ''}`;
}

// ─── Download Handlers ────────────────────────────────────────────────────────

function buildDownloadData() {
  const history = staircase.getHistory();
  const threshold = staircase.calculateThreshold(currentConfig.termination?.discardReversals ?? 4);
  const timestamp = new Date().toISOString();
  
  return { 
    metadata: {
      timestamp,
      experimentName: currentConfig.meta.name,
      seed: currentConfig.meta.seed,
      threshold,
      unit: currentConfig.adaptive?.unit || ""
    },
    config: currentConfig,
    history
  };
}

downloadResultsBtn.addEventListener('click', () => {
  if (!staircase || !currentConfig) return;
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
