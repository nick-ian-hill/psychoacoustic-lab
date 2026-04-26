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
const resp1Btn = document.getElementById('resp-1') as HTMLButtonElement;
const resp2Btn = document.getElementById('resp-2') as HTMLButtonElement;

const resultsArea = document.getElementById('results-area') as HTMLDivElement;
const finalThreshold = document.getElementById('final-threshold') as HTMLParagraphElement;
const downloadTxtBtn = document.getElementById('download-txt-btn') as HTMLButtonElement;
const downloadCsvBtn = document.getElementById('download-csv-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;

let engine: AudioEngine;
let staircase: StaircaseController;
let currentConfig: any;
let targetIntervalIndex = -1;
// Seeded RNG for reproducible interval order randomization
let trialRng: () => number;

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

  playBtn.disabled = true;
  playBtn.classList.add('playing');
  playBtn.textContent = "Playing...";
  resp1Btn.disabled = true;
  resp2Btn.disabled = true;

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

    // Build trial data
    const trialData = intervalsConfig.map(interval => {
      if (interval.condition === 'target') {
        return {
          generators: currentConfig.stimuli,
          perturbations: currentConfig.perturbations
        };
      } else {
        return {
          generators: currentConfig.stimuli
        };
      }
    });

    const { buffer, intervalLengths } = await engine.renderTrial(
      trialData,
      currentConfig.paradigm.timing.isiMs,
      staircase.getCurrentValue(),
      currentConfig.calibration,
      currentConfig.globalLevelDb
    );

    // Play and capture AudioContext startTime for synchronized highlighting
    const { source, startTime } = engine.playBuffer(buffer);
    highlightIntervals(intervalLengths, startTime);

    source.onended = () => {
      playBtn.classList.remove('playing');
      const hasITI = currentConfig.paradigm.timing.itiMs !== undefined;
      const canReplay = currentConfig.paradigm.timing.allowReplay ?? false;

      if (hasITI || !canReplay) {
        playBtn.textContent = "Waiting for Response...";
        playBtn.disabled = true;
      } else {
        playBtn.textContent = "Listen Again";
        playBtn.disabled = false;
      }

      resp1Btn.disabled = false;
      resp2Btn.disabled = false;
    };
  } catch (e: any) {
    console.error(e);
    alert("Playback error: " + e.message);
    playBtn.classList.remove('playing');
    playBtn.textContent = "Error";
  }
});

function handleResponse(responseIndex: number) {
  const isCorrect = responseIndex === targetIntervalIndex;

  // Flash correct/incorrect feedback on the chosen button
  const btn = responseIndex === 0 ? resp1Btn : resp2Btn;
  const originalBorderColor = btn.style.borderColor;
  btn.style.borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
  btn.style.color = isCorrect ? 'var(--success)' : 'var(--error)';

  setTimeout(() => {
    btn.style.borderColor = originalBorderColor;
    btn.style.color = '';

    staircase.processResponse(isCorrect);

    if (staircase.isFinished(currentConfig.termination)) {
      endExperiment();
    } else {
      updateStatus();
      resp1Btn.disabled = true;
      resp2Btn.disabled = true;

      const itiMs = currentConfig.paradigm.timing.itiMs;
      if (itiMs !== undefined) {
        playBtn.textContent = `Next Trial in ${itiMs}ms...`;
        playBtn.disabled = true;
        setTimeout(() => {
          if (experimentArea.classList.contains('hidden')) return;
          playBtn.disabled = false;
          playBtn.click();
        }, itiMs);
      } else {
        playBtn.textContent = "Play Next Trial";
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
  const outputLatency = engine.getOutputLatency();
  const now = engine.getTime();
  let offsetSec = 0;

  lengths.forEach((len, i) => {
    const durationSec = len / currentConfig.audio.sampleRate;
    const btn = i === 0 ? resp1Btn : resp2Btn;

    // When will this interval actually be audible?
    // audioStartTime is ctx.currentTime at scheduling; outputLatency is the DAC delay.
    const audibleStartSec = audioStartTime + offsetSec + outputLatency;
    const delayMs = Math.max(0, (audibleStartSec - now) * 1000);

    setTimeout(() => btn.classList.add('active'), delayMs);
    setTimeout(() => btn.classList.remove('active'), delayMs + durationSec * 1000);

    offsetSec += durationSec + currentConfig.paradigm.timing.isiMs / 1000;
  });
}

resp1Btn.addEventListener('click', () => handleResponse(0));
resp2Btn.addEventListener('click', () => handleResponse(1));

function updateStatus() {
  const trialNum = staircase.getHistory().length + 1;
  const reversals = staircase.getReversalCount();
  const maxReversals = currentConfig.termination.reversals ?? '?';
  statusBadge.textContent = `Trial ${trialNum} | Reversals: ${reversals}/${maxReversals}`;
}

function endExperiment() {
  playBtn.classList.add('hidden');
  resp1Btn.classList.add('hidden');
  resp2Btn.classList.add('hidden');
  statusBadge.classList.add('hidden');
  document.getElementById('instruction-text')?.classList.add('hidden');

  resultsArea.classList.remove('hidden');

  // Use reversal-averaging (discard first 4 reversals) — the scientifically standard method
  const threshold = staircase.calculateThreshold(4);
  finalThreshold.textContent = `Estimated Threshold: ${threshold.toFixed(4)}`;
}

// ─── Download Handlers ────────────────────────────────────────────────────────

function buildDownloadData(): { timestamp: string; history: ReturnType<StaircaseController['getHistory']>; threshold: number } {
  const history = staircase.getHistory();
  const threshold = staircase.calculateThreshold(4);
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
  content += `Estimated Threshold (reversal avg, discard 4): ${threshold.toFixed(4)}\n\n`;
  content += `Trial History:\n`;
  content += `Trial # | Parameter Value | Correct | Reversal\n`;
  content += `--------------------------------------------------\n`;
  history.forEach(h => {
    content += `${String(h.trialIndex + 1).padEnd(8)} | ${h.value.toFixed(4).padEnd(15)} | ${String(h.correct).padEnd(7)} | ${h.isReversal}\n`;
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
    ['trial', 'parameter_value', 'correct', 'is_reversal'],
    ...history.map(h => [h.trialIndex + 1, h.value.toFixed(6), h.correct, h.isReversal]),
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
