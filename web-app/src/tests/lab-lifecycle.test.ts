/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExperimentRunner } from '../logic/runner.js';

// Mock AudioEngine
vi.mock('../audio/engine.js', () => {
  return {
    AudioEngine: class {
      resume = vi.fn().mockResolvedValue(undefined);
      setBaseSeed = vi.fn();
      getTime = () => 0;
      playBuffer = vi.fn().mockResolvedValue({ source: { onended: null }, startTime: 0 });
      renderTrial = vi.fn().mockResolvedValue({ buffer: {}, intervalLengths: [0.5] });
      close = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe('Experiment Lifecycle & Backups', () => {
  let container: HTMLElement;
  let runner: ExperimentRunner;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    // Minimal required UI for ExperimentRunner
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

  const advance = async () => {
    vi.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();
  };

  it('should dispatch block-complete event and save backup', async () => {
    const config: any = {
      meta: { name: 'Backup Test', autoSave: true, seed: 123 },
      blocks: [
        { id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } },
        { id: 'b2', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }
      ]
    };

    const blockEvents: any[] = [];
    container.addEventListener('block-complete', (e: any) => blockEvents.push(e.detail));

    await runner.loadConfig(config);
    
    // Complete Block 1
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    // Verify Event
    expect(blockEvents.length).toBe(1);
    expect(blockEvents[0].blockResult.blockId).toBe('b1');
    expect(blockEvents[0].experiment).toBe('Backup Test');

    // Verify LocalStorage Backup
    const backupKey = 'psycho_lab_backup_Backup Test';
    const backup = JSON.parse(localStorage.getItem(backupKey) || '{}');
    expect(backup.seed).toBe(123);
    expect(backup.results.length).toBe(1);
    expect(backup.results[0].blockId).toBe('b1');
  });

  it('should clear backup on experiment completion', async () => {
    const config: any = {
      meta: { name: 'Clear Test', autoSave: true },
      blocks: [{ id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }]
    };

    await runner.loadConfig(config);
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    const backupKey = 'psycho_lab_backup_Clear Test';
    expect(localStorage.getItem(backupKey)).toBeNull();
  });

  it('should offer to restore session from backup', async () => {
    const config: any = {
      meta: { name: 'Restore Test', autoSave: true, seed: 999 },
      blocks: [
        { id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } },
        { id: 'b2', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }
      ]
    };

    // Pre-seed a backup
    const backupData = {
      seed: 999,
      results: [{ blockId: 'b1', threshold: 0.5, runIndex: 0, presentationOrder: 1 }],
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('psycho_lab_backup_Restore Test', JSON.stringify(backupData));

    // Load config - should show modal
    await runner.loadConfig(config);

    const modal = container.querySelector('.modal');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('Resume Session?');

    // Click "Resume"
    const resumeBtn = modal!.querySelector('#modal-cancel') as HTMLElement;
    resumeBtn.click();

    // Should now be at block 2 (index 1)
    expect((runner as any).currentBlockIndex).toBe(1);
    expect((runner as any).sessionResults.length).toBe(1);
    expect((runner as any).activeSeed).toBe(999);
  });

  it('should start fresh if user rejects backup', async () => {
    const config: any = {
      meta: { name: 'Reject Test', autoSave: true, seed: 111 },
      blocks: [{ id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }]
    };

    localStorage.setItem('psycho_lab_backup_Reject Test', JSON.stringify({ seed: 999, results: [{ id: 'b1' }] }));

    await runner.loadConfig(config);
    const modal = container.querySelector('.modal');
    
    // Click "Start Fresh"
    const freshBtn = modal!.querySelector('#modal-confirm') as HTMLElement;
    freshBtn.click();

    expect((runner as any).currentBlockIndex).toBe(0);
    expect((runner as any).sessionResults.length).toBe(0);
    expect((runner as any).activeSeed).toBe(111);
  });

  it('should ignore existing backups if disableAutoSave is true', async () => {
    const config: any = {
      meta: { name: 'Ignore Backup Test', autoSave: true, seed: 123 },
      blocks: [{ id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }]
    };

    // Pre-seed a backup
    localStorage.setItem('psycho_lab_backup_Ignore Backup Test', JSON.stringify({ seed: 999, results: [{ blockId: 'b1' }] }));

    // Instantiate with disableAutoSave
    runner = new ExperimentRunner(container, { disableAutoSave: true });
    await runner.loadConfig(config);

    const modal = container.querySelector('.modal');
    expect(modal).toBeNull(); // No prompt should appear
    expect((runner as any).currentBlockIndex).toBe(0);
    expect((runner as any).activeSeed).toBe(123); // Uses config seed, not backup seed
  });

  it('should not save backups if disableAutoSave is true', async () => {
    const config: any = {
      meta: { name: 'No Save Test', autoSave: true, seed: 123 },
      blocks: [
        { id: 'b1', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } },
        { id: 'b2', stimuli: [], termination: { trials: 1 }, paradigm: { type: 'nAFC', intervals: [{}], timing: { readyDelayMs: 0, itiMs: 0, feedbackDurationMs: 10 } } }
      ]
    };

    runner = new ExperimentRunner(container, { disableAutoSave: true });
    await runner.loadConfig(config);
    
    // Complete Block 1
    await (runner as any).handlePlayClick();
    await advance();
    await (runner as any).handleResponse(0);
    await advance();

    // Verify LocalStorage is empty for this experiment
    const backupKey = 'psycho_lab_backup_No Save Test';
    expect(localStorage.getItem(backupKey)).toBeNull();
  });

  it('should cancel experiment when quit button is clicked', async () => {
    // 1. Load a config and mock elements
    const mockConfig = {
      meta: { name: 'Quit Test' },
      blocks: [{ paradigm: { type: '2AFC', intervals: [{ condition: 'target' }, { condition: 'reference' }] } }]
    };
    
    // @ts-ignore - access private elements for mocking
    const quitBtn = runner.elements.quitBtn;
    // @ts-ignore
    const cancelSpy = vi.spyOn(runner, 'cancel');
    // @ts-ignore
    const showModalSpy = vi.spyOn(runner, 'showModal');

    await runner.loadConfig(mockConfig as any);

    // 2. Click the quit button
    // Before start, it should cancel immediately
    quitBtn?.dispatchEvent(new MouseEvent('click'));
    expect(cancelSpy).toHaveBeenCalled();

    // 3. Start experiment (mock start time) and click again
    cancelSpy.mockClear();
    // @ts-ignore - mock started state
    runner.currentBlockStartTime = new Date().toISOString();
    
    quitBtn?.dispatchEvent(new MouseEvent('click'));
    
    // Now it should show the confirmation modal instead of cancelling immediately
    expect(showModalSpy).toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('should show confirmation modal if user has clicked Start but not yet responded', async () => {
    const mockConfig = {
      meta: { name: 'Mid-Trial Test' },
      blocks: [{ id: 'b1', paradigm: { type: '2AFC', intervals: [{}, {}], timing: { readyDelayMs: 0 } } }]
    };
    await runner.loadConfig(mockConfig as any);
    
    // @ts-ignore
    const showModalSpy = vi.spyOn(runner, 'showModal');
    // @ts-ignore
    const cancelSpy = vi.spyOn(runner, 'cancel');

    // 1. Simulate clicking Start
    await (runner as any).handlePlayClick();
    
    // 2. Click quit button
    // @ts-ignore
    runner.elements.quitBtn.dispatchEvent(new MouseEvent('click'));

    // Should show modal because we have "started" the block
    expect(showModalSpy).toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
