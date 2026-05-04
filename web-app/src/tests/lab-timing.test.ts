import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine } from '../audio/engine.js';
import { ExperimentRunner } from '../logic/runner.js';

// Mock AudioContext
class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  baseLatency = 0.01;
  outputLatency = 0.01;
  
  createBuffer() { return { length: 100, duration: 0.1, copyToChannel: vi.fn() }; }
  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null
    };
  }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

const mockElement = () => ({
  classList: { 
    add: vi.fn(), 
    remove: vi.fn(), 
    contains: vi.fn(() => false),
    toggle: vi.fn()
  },
  innerHTML: '',
  textContent: '',
  appendChild: vi.fn(),
  querySelector: vi.fn(() => mockElement()),
  querySelectorAll: vi.fn(() => []),
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  disabled: false
});

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('window', { AudioContext: MockAudioContext });
vi.stubGlobal('document', {
  createElement: vi.fn(() => mockElement()),
  getElementById: vi.fn(() => mockElement()),
  addEventListener: vi.fn()
});
vi.stubGlobal('Worker', class {
  onmessage = null;
  postMessage() {}
  terminate() {}
});

describe('Experimental Timing Logic', () => {
  let engine: AudioEngine;
  let container: any;

  beforeEach(() => {
    engine = new AudioEngine(123);
    container = mockElement();
  });

  it('AudioEngine should apply a minimum 100ms lookahead fallback', async () => {
    const ctx = (engine as any).ctx;
    ctx.currentTime = 10.0;
    
    const buffer = ctx.createBuffer();
    const { startTime } = await engine.playBuffer(buffer as any);
    
    // currentTime(10.0) + latency(0.02) = 10.02
    expect(startTime).toBeCloseTo(10.02);
  });

  it('AudioEngine should respect exact scheduledTime if provided', async () => {
    const ctx = (engine as any).ctx;
    ctx.currentTime = 10.0;
    const requestedTime = 10.5;
    
    const buffer = ctx.createBuffer();
    const { startTime } = await engine.playBuffer(buffer as any, requestedTime);
    
    expect(startTime).toBe(10.5);
  });

  it('ExperimentRunner should calculate precise ITI start times', async () => {
    const runner = new ExperimentRunner(container);
    // Inject mock engine
    (runner as any).engine = engine;
    vi.spyOn(engine, 'renderTrial').mockResolvedValue({ buffer: {} as any, intervalLengths: [] });
    (runner as any).staircase = { processResponse: () => ({ correct: true }), isFinished: () => false, getHistory: () => [], getReversalCount: () => 0, getCurrentValue: () => 1 };
    (runner as any).currentBlock = { 
      id: 'test',
      paradigm: { intervals: [{ selectable: true }], timing: { itiMs: 1000, feedbackDurationMs: 0 } },
      stimuli: [],
      perturbations: [],
      meta: { summary: 'test' }
    };
    (runner as any).responseButtons = [mockElement()];
    (runner as any).currentConfig = { meta: { name: 'test' }, calibration: {}, globalLevelDb: 60, blocks: [] };
    (runner as any).trialRng = () => 0.5;
    (runner as any).isInputEnabled = true;

    const playSpy = vi.spyOn(runner as any, 'playNextTrial');
    const ctx = (engine as any).ctx;
    ctx.currentTime = 5.0;

    runner['handleResponse'](0);

    // After the feedback delay (0 in our mock), it should schedule the next trial
    // feedback(0) + iti(1000ms) = 1s delay
    // So scheduled start should be ctx.currentTime (5.0) + 1.0 = 6.0
    
    // We need to wait for the internal setTimeout in handleResponse
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(playSpy).toHaveBeenCalledWith(6.0);
  });

  it('ExperimentRunner should calculate precise Ready Delay start times', async () => {
    const runner = new ExperimentRunner(container);
    (runner as any).engine = engine;
    vi.spyOn(engine, 'renderTrial').mockResolvedValue({ buffer: {} as any, intervalLengths: [] });
    
    (runner as any).currentBlock = { 
      id: 'test',
      paradigm: { intervals: [{ selectable: true }], timing: { readyDelayMs: 500 } },
      stimuli: [],
      meta: { summary: 'test' }
    };
    (runner as any).currentConfig = { meta: { name: 'test' }, calibration: {}, globalLevelDb: 60, blocks: [] };
    (runner as any).trialRng = () => 0.5;
    
    const playSpy = vi.spyOn(runner as any, 'playNextTrial');
    const ctx = (engine as any).ctx;
    ctx.currentTime = 10.0;

    await runner['handlePlayClick']();

    // currentTime(10.0) + readyDelay(500ms) = 10.5
    expect(playSpy).toHaveBeenCalledWith(10.5);
  });

  it('ExperimentRunner should handle UI highlights correctly even during a 150ms main-thread lag', async () => {
    const runner = new ExperimentRunner(container);
    (runner as any).engine = engine;
    (runner as any).currentBlock = { paradigm: { timing: { isiMs: 400 } } };
    
    const btn = mockElement();
    (runner as any).responseButtons = [btn];

    // Sound is scheduled to start at 10.1
    const startTime = 10.1;
    const intervalLengths = [0.4]; // 400ms interval

    // SIMULATE LAG: By the time we call highlightIntervals, the clock has jumped to 10.25
    // (This is 150ms after it should have started, and 250ms after the schedule was created)
    const ctx = (engine as any).ctx;
    ctx.currentTime = 10.25; 

    runner['highlightIntervals'](intervalLengths, startTime);

    // Because the sound is currently "playing" (started at 10.1, ends at 10.5, current is 10.25),
    // the button should have been highlighted immediately.
    expect(btn.classList.add).toHaveBeenCalledWith('active');
  });
});
