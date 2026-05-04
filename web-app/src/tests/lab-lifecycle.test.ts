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
      renderTrial = vi.fn().mockImplementation((intervals) => Promise.resolve({ buffer: { duration: 1.1 }, intervalLengths: intervals.map(() => 0.5) }));
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
      blocks: [{ id: 'b1', stimuli: [], paradigm: { type: '2AFC', intervals: [{}, {}], timing: { readyDelayMs: 0 } } }]
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

  describe('Extended Lifecycle Features', () => {
    it('responseDelayMs: should delay enabling response buttons', async () => {
      const config: any = {
        meta: { name: 'Delay Test' },
        blocks: [{ 
          id: 'b1', 
          stimuli: [],
          paradigm: { 
            type: '2AFC', 
            intervals: [{ selectable: true }, { selectable: true }],
            timing: { readyDelayMs: 0, isiMs: 100, responseDelayMs: 500 } 
          }
        }]
      };

      await runner.loadConfig(config);
      await (runner as any).handlePlayClick();
      
      // Total stimulus time: 0.5 (int1) + 0.1 (isi) + 0.5 (int2) = 1.1s
      // Plus responseDelayMs: 0.5s = 1.6s
      
      vi.advanceTimersByTime(1200); // Past sound (1.1s) but before response delay (1.6s)
      expect((runner as any).isInputEnabled).toBe(false);
      
      vi.advanceTimersByTime(500); // 1.7s total
      expect((runner as any).isInputEnabled).toBe(true);
    });

    it('allowReplay: should allow replaying stimulus during response phase', async () => {
      const config: any = {
        meta: { name: 'Replay Test' },
        blocks: [{ 
          id: 'b1', 
          stimuli: [],
          paradigm: { 
            type: '2AFC', 
            intervals: [{}, {}],
            timing: { readyDelayMs: 0, allowReplay: true } 
          }
        }]
      };

      await runner.loadConfig(config);
      await (runner as any).handlePlayClick();
      
      // Simulate end of play
      const { source } = await (runner as any).engine.playBuffer();
      if (source.onended) source.onended();
      
      const playBtn = container.querySelector('#play-btn') as HTMLButtonElement;
      expect(playBtn.disabled).toBe(false);
      expect(playBtn.textContent).toBe('Replay Stimulus');
      
      // Click replay
      await (runner as any).handlePlayClick();
      expect((runner as any).engine.playBuffer).toHaveBeenCalledTimes(3);
    });

    it('feedback: false: should suppress feedback highlights', async () => {
      const config: any = {
        meta: { name: 'No Feedback Test' },
        blocks: [{ 
          id: 'b1', 
          feedback: false,
          stimuli: [],
          paradigm: { type: '2AFC', intervals: [{}, {}], timing: { feedbackDurationMs: 100 } }
        }]
      };

      await runner.loadConfig(config);
      (runner as any).staircase = { processResponse: () => ({ correct: true }), isFinished: () => false, getHistory: () => [], getReversalCount: () => 0, getCurrentValue: () => 1 };
      (runner as any).isInputEnabled = true;

      const btn = (runner as any).responseButtons[0];
      await (runner as any).handleResponse(0);
      
      expect(btn.classList.contains('correct')).toBe(false);
      expect(btn.classList.contains('incorrect')).toBe(false);
    });

    it('block.ui: should correctly merge display options', async () => {
      const config: any = {
        meta: { name: 'UI Merge Test', summary: 'Global' },
        ui: { showTrialNumber: true, showReversals: false },
        blocks: [{ 
          id: 'b1', 
          ui: { showReversals: true }, // Override
          stimuli: [],
          paradigm: { type: '2AFC', intervals: [{}, {}] }
        }]
      };

      await runner.loadConfig(config);
      const statusBadge = container.querySelector('#status-badge')!;
      expect(statusBadge.textContent).toContain('Trial: 1');
      expect(statusBadge.textContent).toContain('Reversals: 0');
    });

    it('meta.seed: should use per-block seed if provided', async () => {
      const config: any = {
        meta: { name: 'Seed Test', seed: 1000 },
        blocks: [{ 
          id: 'b1', 
          meta: { seed: 9999 },
          stimuli: [],
          paradigm: { type: '2AFC', intervals: [{}, {}] }
        }]
      };

      await runner.loadConfig(config);
      expect((runner as any).engine.setBaseSeed).toHaveBeenCalledWith(9999);
    });

    it('Resume: should correctly re-seed RNG for the next block', async () => {
      const config: any = {
        meta: { name: 'Resume RNG Test', autoSave: true, seed: 1000 },
        blocks: [
          { id: 'b1', stimuli: [], paradigm: { type: '2AFC', intervals: [{}, {}] } },
          { id: 'b2', stimuli: [], paradigm: { type: '2AFC', intervals: [{}, {}] } }
        ]
      };

      // Mock backup after block 1
      const backupData = {
        seed: 1000,
        results: [{ blockId: 'b1', threshold: 0.5, runIndex: 0, presentationOrder: 1 }],
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('psycho_lab_backup_Resume RNG Test', JSON.stringify(backupData));

      await runner.loadConfig(config);
      // Click Resume
      const modal = container.querySelector('.modal');
      (modal!.querySelector('#modal-cancel') as HTMLElement).click();

      // Block index should be 1. Seed should be activeSeed(1000) + index(1) = 1001
      expect((runner as any).currentBlockIndex).toBe(1);
      expect((runner as any).engine.setBaseSeed).toHaveBeenCalledWith(1001);
    });

    it('Quit: should clear backup for the experiment', async () => {
      const config: any = {
        meta: { name: 'Quit Backup Test', autoSave: true, seed: 1000 },
        blocks: [{ id: 'b1', stimuli: [], paradigm: { type: '2AFC', intervals: [{}, {}] } }]
      };

      await runner.loadConfig(config);
      (runner as any).currentBlockStartTime = new Date().toISOString(); // Simulate start
      
      // Manually set a backup (as if block 1 was finished in a multi-block experiment)
      localStorage.setItem('psycho_lab_backup_Quit Backup Test', JSON.stringify({ seed: 1000, results: [] }));

      // Click quit
      (runner as any).elements.quitBtn.dispatchEvent(new MouseEvent('click'));
      
      // Confirm quit in modal
      const modal = container.querySelector('.modal');
      (modal!.querySelector('#modal-confirm') as HTMLElement).click();

      expect(localStorage.getItem('psycho_lab_backup_Quit Backup Test')).toBeNull();
    });
  });
});
