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
const downloadTxtBtn = document.getElementById('download-txt-btn') as HTMLButtonElement;
const downloadCsvBtn = document.getElementById('download-csv-btn') as HTMLButtonElement;
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

  const hasITI = currentConfig.paradigm.timing.itiMs !== undefined;
  if (hasITI) {
    playBtn.classList.add('hidden'); // Hide permanently if automated
  }
  
  playBtn.disabled = true;
  playBtn.classList.add('playing');
  playBtn.textContent = "\u00A0";
  responseButtons.forEach(btn => btn.disabled = true);

  // Add a 1000ms lead-in delay for the first trial ONLY to allow participant preparation
  if (staircase.getHistory().length === 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));
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
        const hasITI = currentConfig.paradigm.timing.itiMs !== undefined;
        const canReplay = currentConfig.paradigm.timing.allowReplay ?? false;

        if (hasITI || !canReplay) {
          if (!hasITI) playBtn.textContent = "Next Trial";
          playBtn.disabled = true;
        } else {
          playBtn.textContent = "Listen Again";
          playBtn.disabled = false;
        }

        responseButtons.forEach(btn => btn.disabled = false);
      };
  } catch (e: any) {
    console.error(e);
    alert("Playback error: " + e.message);
    playBtn.classList.remove('playing');
    playBtn.textContent = "Error";
  }
});

function handleResponse(responseIndex: number) {
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
      if (itiMs !== undefined) {
        playBtn.textContent = "\u00A0"; // Clear text but maintain button height
        playBtn.disabled = true;
        setTimeout(() => {
          if (experimentArea.classList.contains('hidden')) return;
          playBtn.disabled = false;
          playBtn.click();
        }, itiMs);
      } else {
        playBtn.textContent = "Next Trial";
        playBtn.disabled = false;
      }
    }
  }, 500);
}

/**
 * Highlights each interval button in precise synchrony with the audio.
 * Uses AudioContext.currentTime as the reference clock, accounting for
 * hardware output latency, rather than unreliable wall-clock setTimeout drift.
 */
function highlightIntervals(lengths: number[], audioStartTime: number) {
  const sampleRate = currentConfig.audio.sampleRate || 44100;
  const isiSec = (currentConfig.paradigm.timing.isiMs || 0) / 1000;
  
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

  const wallStart = performance.now();
  const totalDurationMs = offset * 1000 + 500; // Total sequence + safety buffer

  console.log(`[v3.2] Highlight sequence starting, duration: ${totalDurationMs}ms`);

  const timer = setInterval(() => {
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
        // Direct style application for rock-solid border sync
        interval.btn.style.borderColor = shouldBeActive ? '#38bdf8' : '';
      }
    });

    if (allFinished) {
      clearInterval(timer);
      const idx = highlightTimeouts.indexOf(timer);
      if (idx > -1) highlightTimeouts.splice(idx, 1);
      clearFeedback(); // Final safety reset for all buttons
    }
  }, 10);
  
  highlightTimeouts.push(timer);
}

function clearFeedback() {
  // Force browser to lose focus on any active element (removes mobile focus rings)
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  highlightTimeouts.forEach(t => {
    clearTimeout(t);
    clearInterval(t);
  });
  highlightTimeouts = [];
  
  responseButtons.forEach(btn => {
    btn.classList.remove('active', 'correct', 'incorrect');
    btn.style.borderColor = '';
    btn.style.color = '';
  });
}

// Response event listeners are attached dynamically during initialization

function updateStatus() {
  const trialNum = staircase.getHistory().length + 1;
  const reversals = staircase.getReversalCount();
  const maxReversals = currentConfig.termination.reversals ?? '?';
  statusBadge.textContent = `Trial ${trialNum} | Reversals: ${reversals}/${maxReversals}`;
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

function buildDownloadData(): { timestamp: string; history: ReturnType<StaircaseController['getHistory']>; threshold: number } {
  const history = staircase.getHistory();
  const threshold = staircase.calculateThreshold(currentConfig.termination?.discardReversals ?? 4);
  const timestamp = new Date().toISOString();
  return { timestamp, history, threshold };
}

downloadTxtBtn.addEventListener('click', () => {
  if (!staircase || !currentConfig) return;
  const { timestamp, history, threshold } = buildDownloadData();

  let content = `Psychoacoustic Lab - Experiment Results\n`;
  content += `======================================\n`;
  content += `Date: ${timestamp}\n`;
  content += `Experiment: ${currentConfig.meta.name}\n`;
  content += `Seed: ${currentConfig.meta.seed}\n`;
  content += `Estimated Threshold (reversal avg, discard ${currentConfig.termination?.discardReversals ?? 4}): ${threshold.toFixed(4)}\n\n`;
  content += `Trial History:\n`;
  content += `Trial # | Parameter Value | Correct | Reversal | Target | Response | Unit\n`;
  content += `--------------------------------------------------------------------------------\n`;
  history.forEach(h => {
    const meta = h.metadata || {};
    content += `${String(h.trialIndex + 1).padEnd(8)} | ${h.value.toFixed(4).padEnd(15)} | ${String(h.correct).padEnd(7)} | ${String(h.isReversal).padEnd(8)} | ${String(meta.targetInterval || '').padEnd(6)} | ${String(meta.response || '').padEnd(8)} | ${meta.unit || ''}\n`;
  });

  triggerDownload(content, 'text/plain', `results_${currentConfig.meta.name.replace(/\s+/g, '_')}_${Date.now()}.txt`);
});

downloadCsvBtn.addEventListener('click', () => {
  if (!staircase || !currentConfig) return;
  const { timestamp, history, threshold } = buildDownloadData();

  const rows = [
    ['# Psychoacoustic Lab Results'],
    [`# Experiment: ${currentConfig.meta.name}`],
    [`# Date: ${timestamp}`],
    [`# Seed: ${currentConfig.meta.seed}`],
    [`# Estimated Threshold: ${threshold.toFixed(4)}`],
    [],
    ['trial', 'parameter_value', 'unit', 'correct', 'is_reversal', 'target_interval', 'participant_response', 'resolved_stimulus_state_json'],
    ...history.map(h => [
      h.trialIndex + 1, 
      h.value.toFixed(6), 
      h.metadata?.unit || '',
      h.correct, 
      h.isReversal,
      h.metadata?.targetInterval || '',
      h.metadata?.response || '',
      `"${JSON.stringify(h.metadata?.trialState || []).replace(/"/g, '""')}"` // Escape quotes for CSV
    ]),
  ];

  const csv = rows.map(r => r.join(',')).join('\r\n');
  triggerDownload(csv, 'text/csv', `results_${currentConfig.meta.name.replace(/\s+/g, '_')}_${Date.now()}.csv`);
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
