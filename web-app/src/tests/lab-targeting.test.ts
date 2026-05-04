/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentRunner } from '../logic/runner.js';
import { AudioEngine } from '../audio/engine.js';

// Mock AudioEngine
vi.mock('../audio/engine.js', () => {
  return {
    AudioEngine: class {
      seed: number;
      constructor(seed: number) { this.seed = seed; }
      resume = vi.fn().mockResolvedValue(undefined);
      setBaseSeed = vi.fn();
      getTime = () => 0;
      playBuffer = vi.fn().mockResolvedValue({ source: { onended: null }, startTime: 0 });
      renderTrial = vi.fn().mockResolvedValue({ buffer: { length: 1000 }, intervalLengths: [0.5, 0.5] });
      close = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe('Experiment Targeting (applyTo)', () => {
  let container: HTMLElement;
  let runner: ExperimentRunner;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <div id="instruction-text"></div>
      <button id="play-btn"></button>
      <div id="play-btn-container"></div>
      <div id="response-buttons"></div>
      <div id="results-area" class="hidden"></div>
      <div id="results-text"></div>
      <div id="status-badge"></div>
      <button id="download-results-btn"></button>
      <div id="experiment-screen"></div>
      <div id="experiment-info"></div>
      <div id="experiment-main"></div>
      <button id="quit-btn"></button>
    `;
    runner = new ExperimentRunner(container);
    vi.useFakeTimers();
  });

  it('applyTo: "reference" (generators): should only include generator in non-target intervals', async () => {
    const block: any = {
      paradigm: { 
        intervals: [{ selectable: true }, { selectable: true }],
        timing: { isiMs: 400 } 
      },
      stimuli: [
        { type: 'multi_component', applyTo: 'reference', components: [{ frequency: 1000, levelDb: 60 }], durationMs: 10, globalEnvelope: { attackMs: 0, releaseMs: 0 } },
        { type: 'multi_component', applyTo: 'target', components: [{ frequency: 2000, levelDb: 60 }], durationMs: 10, globalEnvelope: { attackMs: 0, releaseMs: 0 } }
      ]
    };

    (runner as any).engine = new (AudioEngine as any)(123);
    (runner as any).currentBlock = block;
    (runner as any).currentConfig = { calibration: {}, globalLevelDb: 60 };
    (runner as any).trialRng = () => 0.1;
    
    const trialModule = await import('../logic/trial.js');
    vi.spyOn(trialModule, 'generateTrialState').mockReturnValue({ targetIndex: 1, intervalPerturbations: [[], []] });

    await (runner as any).prepareTrial();
    
    const renderCall = (runner as any).engine.renderTrial.mock.calls[0];
    const intervals = renderCall[0];
    
    // Interval 0 (Reference): should have the 1000Hz gen
    expect(intervals[0].generators[0].components[0].frequency).toBe(1000);
    
    // Interval 1 (Target): should have the 2000Hz gen
    expect(intervals[1].generators[0].components[0].frequency).toBe(2000);
  });

  it('applyTo: "target" (perturbations): should only apply perturbation to target interval', async () => {
    const block: any = {
      paradigm: { 
        intervals: [{ selectable: true }, { selectable: true }],
        timing: { isiMs: 400 } 
      },
      stimuli: [
        { type: 'multi_component', components: [{ frequency: 1000, levelDb: 60 }], durationMs: 10, globalEnvelope: { attackMs: 0, releaseMs: 0 } }
      ],
      perturbations: [
        { type: 'gain', applyTo: 'target', deltaDb: 10 }
      ]
    };

    (runner as any).engine = new (AudioEngine as any)(123);
    (runner as any).currentBlock = block;
    (runner as any).currentConfig = { calibration: {}, globalLevelDb: 60 };
    (runner as any).trialRng = () => 0.1;
    
    const trialModule = await import('../logic/trial.js');
    vi.spyOn(trialModule, 'generateTrialState').mockReturnValue({ targetIndex: 1, intervalPerturbations: [[], []] });

    await (runner as any).prepareTrial();
    const renderCall = (runner as any).engine.renderTrial.mock.calls[0];
    const intervals = renderCall[0];
    
    // Interval 0 (Reference): should have NO gain perturbation
    expect(intervals[0].perturbations.length).toBe(0);
    
    // Interval 1 (Target): should have gain perturbation
    expect(intervals[1].perturbations[0].type).toBe('gain');
    expect(intervals[1].perturbations[0].deltaDb).toBe(10);
  });
});
