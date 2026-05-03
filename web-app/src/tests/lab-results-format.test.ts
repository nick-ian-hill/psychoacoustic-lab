/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExperimentRunner } from '../logic/runner.js';

// Mock AudioEngine to prevent AudioContext errors
vi.mock('../audio/engine.js', () => {
  return {
    AudioEngine: class {
      resume = vi.fn().mockResolvedValue(undefined);
      setBaseSeed = vi.fn();
      getTime = () => 0;
      playBuffer = vi.fn().mockResolvedValue({ source: { onended: null }, startTime: 0 });
      renderTrial = vi.fn().mockImplementation((intervals) => Promise.resolve({ 
        buffer: {}, 
        intervalLengths: intervals.map(() => 0.5),
        resolvedPerturbations: intervals.map(() => [{ type: 'gain', resolvedValue: 1.23 }]) 
      }));
      close = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe('Results Format Validation', () => {
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
    `;
    
    runner = new ExperimentRunner(container);
    vi.useFakeTimers();
  });

  const advance = async () => {
    vi.advanceTimersByTime(2000); // Plenty of time
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('should generate correct structure for adaptive block', async () => {
    const config: any = {
      meta: { name: 'Adaptive Test', seed: 123 },
      blocks: [{
        id: 'b1',
        paradigm: { type: 'nAFC', intervals: [{}, {}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } },
        stimuli: [],
        adaptive: { initialValue: 10, stepSizes: [1], rule: { correctDown: 1, wrongUp: 1 }, stepType: 'linear' },
        termination: { trials: 1 } // Use 1 for faster test
      }]
    };

    await runner.loadConfig(config);
    
    // Trial 1
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    const results = (runner as any).sessionResults;
    expect(results.length).toBe(1);
    
    const res = results[0];
    expect(res.blockId).toBe('b1');
    expect(res.history.length).toBe(1);
    expect(typeof res.startTime).toBe('string');
    expect(typeof res.endTime).toBe('string');
  });

  it('should capture trial metadata (roving state)', async () => {
    const config: any = {
      meta: { name: 'Roving Test', seed: 456 },
      blocks: [{
        id: 'roved',
        paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } },
        stimuli: [{ type: 'multi_component', durationMs: 100, components: [] }],
        perturbations: [{ type: 'gain', applyTo: 'all', value: { type: 'uniform', min: -5, max: 5 } }],
        termination: { trials: 1 }
      }]
    };

    await runner.loadConfig(config);
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    const results = (runner as any).sessionResults;
    expect(results.length).toBe(1);
    const history = results[0].history[0];
    expect(history.metadata).toBeDefined();
    expect(history.metadata.intervalStates).toBeDefined();
    expect(history.metadata.intervalStates[0][0].resolvedValue).toBe(1.23);
  });

  it('should handle multi-block indexing', async () => {
    const config: any = {
      meta: { name: 'Multi Test', seed: 789 },
      blocks: [
        { id: 'exp', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } },
        { id: 'exp', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }
      ]
    };

    await runner.loadConfig(config);

    // Block 1
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    // Block 2
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    const results = (runner as any).sessionResults;
    expect(results.length).toBe(2);
    expect(results[0].blockId).toBe('exp');
    expect(results[1].blockId).toBe('exp');
    expect(results[0].runIndex).toBe(0);
    expect(results[1].runIndex).toBe(1);
    expect(results[0].presentationOrder).toBe(1);
    expect(results[1].presentationOrder).toBe(2);
  });
});
