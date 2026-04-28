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
let isProcessingResponse = false;

const resultsArea = document.getElementById('results-area') as HTMLDivElement;
const finalThreshold = document.getElementById('final-threshold') as HTMLParagraphElement;
const downloadResultsBtn = document.getElementById('download-results-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;

let engine: AudioEngine;
let staircase: StaircaseController;
let currentConfig: any;
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
    const resolvedPerturbations: any[] = [];
    if (currentConfig.perturbations) {
      currentConfig.perturbations.forEach((p: any) => {
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
      generators: currentConfig.stimuli,
      perturbations: resolvedPerturbations
    };
  });

  lastTrialData = trialData;

  return engine.renderTrial(
    trialData,
    currentConfig.paradigm.timing.isiMs,
    staircase.getCurrentValue(),
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
    if (engine) {
      await engine.close();
    }
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

/**
 * Renders and plays the next pre-rendered trial, optionally scheduling
 * the audio onset at a precise AudioContext timestamp.
 *
 * When scheduledTime is provided (auto-advance mode), the ITI is enforced
 * entirely by the sample-accurate AudioContext clock, eliminating the
 * accumulated error from wall-clock setTimeout drift and output latency.
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
  if (!engine || !staircase) return;
  await engine.resume();

  // Always hide play button after first click as we are always in automated mode
  playBtn.classList.add('hidden');

  playBtn.disabled = true;
  playBtn.classList.add('playing');
  playBtn.textContent = "\u00A0";
  responseButtons.forEach(btn => btn.disabled = true);

  // Add a brief lead-in delay for the first trial to allow participant preparation.
  if (staircase.getHistory().length === 0) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await playNextTrial(); // No scheduled time — play as soon as possible
});

function handleResponse(responseIndex: number) {
  if (isProcessingResponse) return;
  isProcessingResponse = true;

  // Disable all buttons immediately to prevent double-triggers (e.g. rapid trackpad taps).
  responseButtons.forEach(b => b.disabled = true);

  playBtn.textContent = "\u00A0";
  const isCorrect = responseIndex === targetIntervalIndex;

  const btn = responseButtons[responseIndex];
  btn.classList.add(isCorrect ? 'correct' : 'incorrect');
  btn.blur();

  const feedbackMs = currentConfig.paradigm.timing.feedbackDurationMs ?? 400;
  const itiMs = currentConfig.paradigm.timing.itiMs ?? 1000;

  // 1. Process staircase logic immediately upon response
  try {
    staircase.processResponse(isCorrect, {
      targetInterval: targetIntervalIndex + 1,
      response: responseIndex + 1,
      parameterValue: staircase.getCurrentValue(),
      unit: currentConfig.adaptive.unit || "",
      trialState: lastTrialData
    });

    // 2. IMMEDIATELY start pre-rendering the next trial in the background.
    // Synthesis runs during the feedback window so the buffer is ready by ITI end.
    if (!staircase.isFinished(currentConfig.termination)) {
      preRenderedTrial = prepareTrial();
    }
  } catch (e) {
    console.error("Staircase update failed:", e);
    isProcessingResponse = false;
    playBtn.disabled = false;
    playBtn.textContent = "Error \u2014 check config";
    return;
  }

  // 3. Wait for feedback duration, then schedule the next trial via the AudioContext clock.
  // Capturing the AudioContext time here (inside setTimeout) rather than before it means
  // any setTimeout jitter is absorbed into the clock reading, not added on top of the ITI.
  setTimeout(() => {
    btn.classList.remove('correct', 'incorrect');

    if (staircase.isFinished(currentConfig.termination)) {
      endExperiment();
      isProcessingResponse = false;
    } else {
      updateStatus();

      if (experimentArea.classList.contains('hidden')) return;

      // Compute the exact AudioContext timestamp at which the next stimulus should begin.
      // outputLatency is NOT added here — it's only needed when scheduling at near-zero
      // lookahead to prevent buffer underrun. With itiMs >> latency, the WebAudio scheduler
      // fills the buffer automatically; adding latency would just extend perceived silence.
      const scheduledStartTime = engine.getTime() + itiMs / 1000;

      // isProcessingResponse is cleared here — the ITI period has begun and the
      // buttons remain disabled until highlightIntervals re-enables them.
      isProcessingResponse = false;

      playNextTrial(scheduledStartTime);
    }
  }, feedbackMs);

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
    // FALLBACK: If AudioContext time freezes (common on mobile sleep/interrupt), use wall-clock timeout.
    const wallClockTimeout = (wallNow - wallStart) > (totalDurationMs + 1000);
    if (!buttonsEnabled && (now >= enableButtonsAt || wallClockTimeout)) {
      if (wallClockTimeout && now < enableButtonsAt) {
        console.warn("[highlightIntervals] AudioContext clock appears frozen. Forcing button enablement via wall-clock.");
      }
      responseButtons.forEach(btn => btn.disabled = false);
      buttonsEnabled = true;
    }

    // Ensure we don't stop the loop until buttons are enabled or timeout reached
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
  // Cancel any active rAF highlight loop
  if (highlightTimeouts[0]) {
    cancelAnimationFrame(highlightTimeouts[0]);
  }
  highlightTimeouts = [];

  // 1. Force focus away from all buttons to the main container
  // This helps prevent 'sticky' focus/hover rings on mobile devices.
  const container = document.querySelector('.container') as HTMLElement;
  if (container) {
    container.tabIndex = -1;
    container.focus();
  }

  // 2. Clear visual classes related to stimulus playback.
  // Note: 'correct' and 'incorrect' classes are managed by the handleResponse timer
  // and are intentionally NOT cleared here to prevent premature removal at loop end.
  responseButtons.forEach(btn => {
    btn.classList.remove('active');
    btn.blur();
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
