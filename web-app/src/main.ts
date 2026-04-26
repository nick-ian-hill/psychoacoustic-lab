import { AudioEngine } from './audio/engine';
import { Staircase } from './staircase';
import { ExperimentConfigSchema } from '../../shared/schema';
import * as examples from '../../examples/examples';

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
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;

let engine: AudioEngine;
let staircase: Staircase;
let currentConfig: any;
let targetIntervalIndex = -1;

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
    
    // Initialize Staircase
    if (currentConfig.adaptive && currentConfig.adaptive.type === 'staircase') {
      staircase = new Staircase({
        initialValue: currentConfig.adaptive.initialValue,
        stepSizes: currentConfig.adaptive.stepSizes,
        rule: currentConfig.adaptive.rule,
        minValue: currentConfig.adaptive.minValue,
        maxValue: currentConfig.adaptive.maxValue,
      });
    }

    setupArea.classList.add('hidden');
    experimentArea.classList.remove('hidden');
    
    // Set dynamic instructions
    const instructionEl = document.getElementById('instruction-text');
    if (instructionEl) {
      instructionEl.textContent = currentConfig.meta.instructions || "Listen to the intervals and select the target.";
    }

    updateStatus();
    
    // Ensure AudioContext starts cleanly (requires user gesture)
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
    if (currentConfig.paradigm.randomizeOrder) {
      for (let i = intervalsConfig.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
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

    const buffer = await engine.renderTrial(
      trialData, 
      currentConfig.paradigm.timing.isiMs, 
      staircase.currentValue,
      currentConfig.calibration,
      currentConfig.globalLevelDb
    );

    const source = engine.playBuffer(buffer);
    
    source.onended = () => {
      playBtn.classList.remove('playing');
      playBtn.textContent = "Listen Again";
      playBtn.disabled = false;
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
  
  // Flash correct/incorrect
  const btn = responseIndex === 0 ? resp1Btn : resp2Btn;
  const originalColor = btn.style.borderColor;
  btn.style.borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
  btn.style.color = isCorrect ? 'var(--success)' : 'var(--error)';
  
  setTimeout(() => {
    btn.style.borderColor = originalColor;
    btn.style.color = '';
    
    staircase.recordResponse(isCorrect);
    
    if (staircase.reversals >= currentConfig.termination.reversals) {
      endExperiment();
    } else {
      updateStatus();
      resp1Btn.disabled = true;
      resp2Btn.disabled = true;
      playBtn.textContent = "Play Next Trial";
    }
  }, 500);
}

resp1Btn.addEventListener('click', () => handleResponse(0));
resp2Btn.addEventListener('click', () => handleResponse(1));

function updateStatus() {
  const trialNum = staircase.getHistory().length + 1;
  statusBadge.textContent = `Trial ${trialNum} | Reversals: ${staircase.reversals}/${currentConfig.termination.reversals}`;
}

function endExperiment() {
  playBtn.classList.add('hidden');
  resp1Btn.classList.add('hidden');
  resp2Btn.classList.add('hidden');
  statusBadge.classList.add('hidden');
  document.getElementById('instruction-text')?.classList.add('hidden');
  
  resultsArea.classList.remove('hidden');
  
  // Simple averaging of last N even reversals for threshold
  finalThreshold.textContent = `Estimated Threshold: ${staircase.currentValue.toFixed(2)}`;
}

downloadBtn.addEventListener('click', () => {
  if (!staircase || !currentConfig) return;

  const history = staircase.getHistory();
  const timestamp = new Date().toISOString();
  
  let content = `Psychoacoustic Lab - Experiment Results\n`;
  content += `======================================\n`;
  content += `Date: ${timestamp}\n`;
  content += `Experiment: ${currentConfig.meta.name}\n`;
  content += `Seed: ${currentConfig.meta.seed}\n`;
  content += `Final Threshold: ${staircase.currentValue.toFixed(4)}\n\n`;
  
  content += `Trial History:\n`;
  content += `Trial # | Parameter Value | Correct\n`;
  content += `------------------------------------\n`;
  
  history.forEach(h => {
    content += `${h.trial.toString().padEnd(8)} | ${h.value.toFixed(4).padEnd(15)} | ${h.correct}\n`;
  });

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `results_${currentConfig.meta.name.replace(/\s+/g, '_')}_${new Date().getTime()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

restartBtn.addEventListener('click', () => {
  window.location.reload();
});
