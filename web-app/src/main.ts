import './style.css'
import { AudioEngine } from './audio/engine'
import { StaircaseController } from './logic/staircase'
import type { ExperimentConfig } from '../../shared/schema'

// Example Profile Analysis Config
const exampleConfig: ExperimentConfig = {
  meta: {
    name: "Profile Analysis (Green 1988)",
    version: "1.0.0",
    seed: 42,
    rationale: "Classic spectral profile analysis experiment."
  },
  audio: { sampleRate: 44100 },
  stimulus: {
    type: "harmonic_complex",
    f0: 200,
    harmonics: { from: 1, to: 21 },
    amplitudeProfile: { type: "flat", levelDb: 60 },
    phase: "random",
    duration: 500,
    envelope: { attack: 10, release: 10 }
  },
  perturbations: [
    {
      type: "spectral_profile",
      targetHarmonic: 11, // 2200 Hz
      deltaDb: { adaptive: true } as any
    }
  ],
  conditions: { reference: {}, target: {} },
  paradigm: {
    type: "2AFC",
    intervals: [{ condition: "reference" }, { condition: "target" }],
    randomizeOrder: true,
    timing: { isi: 500 }
  },
  adaptive: {
    type: "staircase",
    parameter: "perturbations[0].deltaDb",
    initialValue: 10,
    stepSizes: [4, 2, 1],
    rule: { correctDown: 2, incorrectUp: 1 },
    initialN: 1,
    switchReversalCount: 2,
    minValue: 0,
    maxValue: 40,
    reversals: 12
  },
  termination: { reversals: 12 }
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h1>Psychoacoustic Lab</h1>
    <div id="setup-panel">
      <button id="start-btn">Start Experiment</button>
    </div>
    <div id="trial-panel" style="display: none;">
      <div class="status">Trial <span id="trial-num">1</span></div>
      <div class="intervals">
        <div id="int-1" class="interval">1</div>
        <div id="int-2" class="interval">2</div>
      </div>
      <div class="controls">
        <button id="choice-1" disabled>Choice 1</button>
        <button id="choice-2" disabled>Choice 2</button>
      </div>
      <div class="progress">
        <div id="progress-bar" style="width: 0%"></div>
      </div>
    </div>
    <div id="results-panel" style="display: none;">
      <h2>Experiment Complete</h2>
      <p>Estimated Threshold: <span id="threshold-val"></span> dB</p>
      <button id="download-btn">Download Data</button>
    </div>
  </div>
`

let engine: AudioEngine;
let staircase: StaircaseController;
let currentTrialBuffer: AudioBuffer | null = null;
let currentTargetInterval: number = 0;

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const choice1Btn = document.getElementById('choice-1') as HTMLButtonElement;
const choice2Btn = document.getElementById('choice-2') as HTMLButtonElement;
const trialNum = document.getElementById('trial-num') as HTMLElement;
const int1 = document.getElementById('int-1') as HTMLElement;
const int2 = document.getElementById('int-2') as HTMLElement;

startBtn.onclick = async () => {
  engine = new AudioEngine(exampleConfig.audio.sampleRate, exampleConfig.meta.seed);
  staircase = new StaircaseController(exampleConfig.adaptive!);
  
  document.getElementById('setup-panel')!.style.display = 'none';
  document.getElementById('trial-panel')!.style.display = 'block';
  
  await nextTrial();
};

async function nextTrial() {
  if (staircase.isFinished(exampleConfig.termination)) {
    finishExperiment();
    return;
  }

  const value = staircase.getCurrentValue();
  trialNum.innerText = (staircase.getHistory().length + 1).toString();
  
  // Prepare trial
  currentTargetInterval = Math.random() < 0.5 ? 0 : 1;
  const intervals = exampleConfig.paradigm.intervals.map((_, i) => {
    const isTarget = i === currentTargetInterval;
    const perturbations = isTarget ? [{
      ...exampleConfig.perturbations![0],
      deltaDb: value
    }] : [];
    return { generator: exampleConfig.stimulus, perturbations: perturbations as any };
  });

  currentTrialBuffer = await engine.renderTrial(intervals, exampleConfig.paradigm.timing.isi);
  
  // Play and visual feedback
  engine.playBuffer(currentTrialBuffer);

  // Interval highlighting
  const intervalDur = exampleConfig.stimulus.duration / 1000;
  const isiDur = exampleConfig.paradigm.timing.isi / 1000;

  setTimeout(() => int1.classList.add('active'), 100);
  setTimeout(() => int1.classList.remove('active'), 100 + intervalDur * 1000);
  
  setTimeout(() => int2.classList.add('active'), 100 + (intervalDur + isiDur) * 1000);
  setTimeout(() => int2.classList.remove('active'), 100 + (2 * intervalDur + isiDur) * 1000);

  // Enable buttons after playback
  setTimeout(() => {
    choice1Btn.disabled = false;
    choice2Btn.disabled = false;
  }, 100 + (2 * intervalDur + isiDur) * 1000);
}

const handleChoice = (choice: number) => {
  choice1Btn.disabled = true;
  choice2Btn.disabled = true;
  
  const correct = choice === currentTargetInterval;
  staircase.processResponse(correct);
  
  nextTrial();
};

choice1Btn.onclick = () => handleChoice(0);
choice2Btn.onclick = () => handleChoice(1);

function finishExperiment() {
  document.getElementById('trial-panel')!.style.display = 'none';
  document.getElementById('results-panel')!.style.display = 'block';
  document.getElementById('threshold-val')!.innerText = staircase.calculateThreshold().toFixed(2);
}

const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
downloadBtn.onclick = () => {
  const data = {
    config: exampleConfig,
    history: staircase.getHistory(),
    threshold: staircase.calculateThreshold()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `experiment_results_${Date.now()}.json`;
  a.click();
};
