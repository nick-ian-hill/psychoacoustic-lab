import { AudioEngine } from "../audio/engine.js";
import { StaircaseController } from "./staircase.js";
import { generateTrialState } from "./trial.js";
import type { ExperimentConfig, BlockConfig, Interval } from "../../../shared/schema.js";
import seedrandom from "seedrandom";

export class ExperimentRunner {
  private engine: AudioEngine;
  private staircase: StaircaseController | null = null;
  private activeSeed: number | undefined;
  private currentConfig: ExperimentConfig | null = null;
  private currentBlockIndex = 0;
  private blockQueue: BlockConfig[] = [];
  private currentBlock: BlockConfig | null = null;
  private currentTargetIndex = -1;
  private trialRng: seedrandom.PRNG | null = null;
  private preRenderedTrial: Promise<{ buffer: AudioBuffer; intervalLengths: number[]; resolvedPerturbations?: any[] }> | null = null;
  private lastTrialBuffer: AudioBuffer | null = null;
  private lastTrialIntervalLengths: number[] | null = null;
  private currentTrialMetadata: any = null;
  
  private container: HTMLElement;
  private elements: {
    instructionText: HTMLElement;
    playBtn: HTMLButtonElement;
    playBtnContainer: HTMLElement;
    responseButtonsContainer: HTMLElement;
    resultsArea: HTMLElement;
    resultsText: HTMLElement;
    statusBadge: HTMLElement;
    downloadBtn: HTMLButtonElement;
    experimentArea: HTMLElement;
    infoArea: HTMLElement;
    mainArea: HTMLElement;
    quitBtn?: HTMLElement;
  };
  
  private isInputEnabled: boolean = false;
  private responseButtons: HTMLButtonElement[] = [];
  private sessionResults: { 
    blockId: string, 
    history: any[], 
    threshold: number,
    runIndex: number,
    presentationOrder: number,
    startTime: string,
    endTime: string
  }[] = [];
  private currentBlockStartTime: string = "";
  private keyDownHandler: (e: KeyboardEvent) => void;
  private options: { disableAutoSave?: boolean };

  constructor(container: HTMLElement, options: { disableAutoSave?: boolean } = {}) {
    this.container = container;
    this.options = options;
    // We'll initialize the engine once we have a config (and its seed)
    this.engine = null as any; 
    
    // Find required UI elements within the container
    this.elements = {
      instructionText: this.findSafe("instruction-text"),
      playBtn: this.findSafe("play-btn") as HTMLButtonElement,
      playBtnContainer: this.findSafe("play-btn-container"),
      responseButtonsContainer: this.findSafe("response-buttons"),
      resultsArea: this.findSafe("results-area"),
      resultsText: this.findSafe("results-text"),
      statusBadge: this.findSafe("status-badge"),
      downloadBtn: this.findSafe("download-results-btn") as HTMLButtonElement,
      experimentArea: this.findSafe("experiment-screen"),
      infoArea: this.findSafe("experiment-info"),
      mainArea: this.findSafe("experiment-main"),
      quitBtn: this.findOptional("quit-btn"),
    };

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only trigger if we have a config AND the experiment screen is visible AND results are NOT visible
        const isExperimentActive = this.currentConfig && 
                                  !this.elements.experimentArea.classList.contains("hidden") && 
                                  this.elements.resultsArea.classList.contains("hidden");
        
        if (isExperimentActive) {
          this.requestCancel();
        }
      }
    };

    this.setupListeners();
  }

  private findSafe(id: string): HTMLElement {
    const el = this.container.querySelector(`#${id}`) || this.container.querySelector(`.${id}`);
    if (!el) {
      // If not found in container, maybe it's globally available (fallback for standalone)
      const globalEl = document.getElementById(id);
      if (globalEl) return globalEl;
      throw new Error(`Required element not found: ${id}`);
    }
    return el as HTMLElement;
  }

  private findOptional(id: string): HTMLElement | undefined {
    try {
      return this.findSafe(id);
    } catch {
      return undefined;
    }
  }

  private setupListeners() {
    this.elements.playBtn.addEventListener("click", () => this.handlePlayClick());
    this.elements.downloadBtn.addEventListener("click", () => this.handleDownload());
    this.elements.quitBtn?.addEventListener("click", () => this.requestCancel());
    document.addEventListener("keydown", this.keyDownHandler);
  }

  public close() {
    if (this.engine) {
      this.engine.close();
      this.engine = null as any;
    }
  }

  public requestCancel() {
    const isExperimentScreenVisible = !this.elements.experimentArea.classList.contains("hidden") && 
                                     this.elements.resultsArea.classList.contains("hidden");
    
    if (!isExperimentScreenVisible) return;

    // If we haven't even started the first trial, just cancel immediately without a modal
    const hasStarted = this.sessionResults.length > 0 || !!this.currentBlockStartTime;

    if (!hasStarted) {
      this.cancel();
      return;
    }

    this.showModal(
      "Cancel Experiment?", 
      "Are you sure you want to stop the current experiment? All progress in this session will be lost.",
      "Stop Experiment",
      () => this.cancel()
    );
  }

  public cancel() {
    this.close();
    if (this.currentConfig?.meta.autoSave && !this.options.disableAutoSave) {
      this.clearBackup(this.currentConfig.meta.name);
    }
    this.elements.resultsArea.classList.add("hidden");
    this.elements.playBtnContainer.classList.add("hidden");
    this.elements.responseButtonsContainer.innerHTML = "";
    this.elements.statusBadge.classList.add("hidden");
    this.elements.instructionText.classList.add("hidden");
    
    this.container.dispatchEvent(new CustomEvent('experiment-cancelled', {
      bubbles: true,
      composed: true
    }));

    this.currentConfig = null;
    this.currentBlock = null;
    this.isInputEnabled = false;
  }

  private showModal(
    title: string, 
    message: string, 
    confirmText: string, 
    onConfirm: () => void, 
    cancelText: string = "Keep Going",
    onCancel?: () => void
  ) {
    const wasInputEnabled = this.isInputEnabled;
    this.isInputEnabled = false;

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>${message}</p>
          <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button class="btn" style="flex: 1; background: var(--psycho-keep-going-btn, var(--psycho-accent));" id="modal-cancel">${cancelText}</button>
            <button class="btn" style="flex: 1; background: var(--psycho-stop-btn, var(--psycho-error));" id="modal-confirm">${confirmText}</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    const close = () => {
      this.isInputEnabled = wasInputEnabled;
      this.container.removeChild(modal);
    };

    modal.querySelector(".modal-close")?.addEventListener("click", () => { close(); if(onCancel) onCancel(); });
    modal.querySelector("#modal-cancel")?.addEventListener("click", () => { close(); if(onCancel) onCancel(); });
    modal.querySelector("#modal-confirm")?.addEventListener("click", () => {
      close();
      onConfirm();
    });
  }

  public async loadConfig(config: ExperimentConfig) {
    if (config.meta.autoSave && !this.options.disableAutoSave) {
      const backup = this.getBackup(config.meta.name);
      if (backup && backup.results.length > 0) {
        this.showModal(
          "Resume Session?",
          `A previous session for "${config.meta.name}" was found with ${backup.results.length} blocks completed. Would you like to resume or start fresh?`,
          "Start Fresh",
          () => this.initSession(config),
          "Resume Session",
          () => this.initSession(config, backup)
        );
        return;
      }
    }
    await this.initSession(config);
  }

  private async initSession(config: ExperimentConfig, backup?: any) {
    this.currentConfig = config;
    this.sessionResults = backup ? backup.results : [];
    
    if (this.engine) {
      await this.engine.close();
    }

    // Reset UI state
    this.elements.resultsArea.classList.add("hidden");
    this.elements.playBtnContainer.classList.remove("hidden");
    this.elements.instructionText.classList.remove("hidden");
    this.elements.infoArea.classList.remove("hidden");
    this.elements.mainArea.classList.remove("hidden");
    
    // Initialize engine and RNG with the experiment's master seed
    this.activeSeed = backup ? backup.seed : (config.meta.seed ?? Math.floor(Math.random() * 1000000));
    this.engine = new AudioEngine(this.activeSeed!);
    this.trialRng = seedrandom(this.activeSeed!.toString());

    // Flatten nested blocks/groups into a linear queue
    this.blockQueue = ExperimentRunner.flattenBlocks(config.blocks, this.trialRng);
    
    // If resuming, start at the next block
    const startIndex = backup ? backup.results.length : 0;
    if (startIndex >= this.blockQueue.length) {
      this.showResults();
    } else {
      await this.startBlock(startIndex);
    }
  }

  /** @internal - Exported for testing */
  public static flattenBlocks(entries: any[], rng: { (): number }): BlockConfig[] {
    let flat: BlockConfig[] = [];
    for (const entry of entries) {
      if (entry.type === "group") {
        const reps = entry.repetitions ?? 1;
        for (let i = 0; i < reps; i++) {
          let groupBlocks = ExperimentRunner.flattenBlocks(entry.blocks, rng);
          if (entry.randomize) {
            // Shuffle using the seeded RNG
            for (let j = groupBlocks.length - 1; j > 0; j--) {
              const k = Math.floor(rng() * (j + 1));
              [groupBlocks[j], groupBlocks[k]] = [groupBlocks[k], groupBlocks[j]];
            }
          }
          flat.push(...groupBlocks);
        }
      } else {
        const reps = entry.repetitions ?? 1;
        for (let i = 0; i < reps; i++) {
          flat.push(entry);
        }
      }
    }
    return flat;
  }

  private async startBlock(index: number) {
    if (!this.currentConfig || index >= this.blockQueue.length) return;
    this.currentBlockIndex = index;
    this.currentBlock = this.blockQueue[index];
    this.currentBlockStartTime = ""; // Reset until user clicks 'Start'
    
    // Derive block-specific seed to ensure independent and reproducible blocks.
    // If a block provides its own seed (e.g. for a fixed practice block), use it.
    // Otherwise, offset the session seed by the block index.
    const blockSeed = this.currentBlock.meta?.seed ?? (this.activeSeed! + index);
    this.engine.setBaseSeed(blockSeed);
    this.trialRng = seedrandom(blockSeed.toString());

    this.staircase = new StaircaseController(this.currentBlock.adaptive);
    this.isInputEnabled = false;

    // Update Instructions
    const summary = this.currentBlock.meta?.summary || this.currentConfig.meta.summary || "Select the target.";
    this.elements.instructionText.textContent = summary;
    const showInstructions = this.currentBlock.ui?.showInstructions ?? true;
    this.elements.instructionText.classList.toggle("hidden", !showInstructions);

    // Render Buttons
    this.elements.responseButtonsContainer.innerHTML = "";
    this.responseButtons = [];
    this.currentBlock.paradigm.intervals.forEach((interval: Interval, idx: number) => {
      const btn = document.createElement("button");
      btn.className = "response-btn";
      btn.textContent = `${idx + 1}`;
      if (interval.selectable === false) {
        btn.classList.add("non-selectable");
      } else {
        btn.addEventListener("click", () => this.handleResponse(idx));
      }
      btn.disabled = true;
      this.elements.responseButtonsContainer.appendChild(btn);
      this.responseButtons.push(btn);
    });

    this.elements.playBtnContainer.classList.remove("hidden");
    this.elements.playBtn.disabled = false;
    this.elements.playBtn.classList.remove("playing");
    this.elements.playBtn.textContent = index === 0 ? "Start Experiment" : `Start Block: ${this.currentBlock.id}`;

    this.elements.resultsArea.classList.add("hidden");
    this.updateStatus();
    
    // Warm up
    await this.engine.resume();
  }

  private async handlePlayClick() {
    if (!this.engine) return;
    await this.engine.resume();

    // Record the actual start time when the user clicks 'Start' for the first trial of the block
    if (!this.currentBlockStartTime) {
      this.currentBlockStartTime = new Date().toISOString();
    }

    this.elements.playBtnContainer.classList.add("hidden");
    this.elements.playBtn.disabled = true;
    this.elements.playBtn.classList.add("playing");
    this.responseButtons.forEach(btn => btn.disabled = true);

    const allowReplay = this.currentBlock?.paradigm.timing.allowReplay ?? false;
    
    if (allowReplay && this.lastTrialBuffer && this.isInputEnabled) {
      // Replay the exact same buffer
      this.isInputEnabled = false; // Disable during replay
      const startTime = this.engine.getTime() + 0.1; // Small fixed lookahead for replay
      const { source } = await this.engine.playBuffer(this.lastTrialBuffer, startTime);
      this.highlightIntervals(this.lastTrialIntervalLengths!, startTime);
      source.onended = () => {
        this.elements.playBtn.classList.remove("playing");
        this.elements.playBtn.disabled = false;
        this.elements.playBtn.textContent = "Replay Stimulus";
      };
      return;
    }

    const readyDelay = this.currentBlock?.paradigm.timing.readyDelayMs ?? 500;
    const startTime = this.engine.getTime() + (readyDelay / 1000);
    await this.playNextTrial(startTime);
  }

  private async playNextTrial(scheduledTime?: number) {
    if (!this.preRenderedTrial) {
      this.preRenderedTrial = this.prepareTrial();
    }

    try {
      const { buffer, intervalLengths, resolvedPerturbations } = await this.preRenderedTrial;
      this.preRenderedTrial = null;
      this.currentTrialMetadata = resolvedPerturbations;

      this.clearFeedback();
      const { source, startTime } = await this.engine.playBuffer(buffer, scheduledTime);
      this.highlightIntervals(intervalLengths, startTime);

      // Cache for potential replay
      this.lastTrialBuffer = buffer;
      this.lastTrialIntervalLengths = intervalLengths;

      source.onended = () => {
        this.elements.playBtn.classList.remove("playing");
        const allowReplay = this.currentBlock?.paradigm.timing.allowReplay ?? false;
        if (allowReplay) {
          this.elements.playBtn.disabled = false;
          this.elements.playBtn.textContent = "Replay Stimulus";
          this.elements.playBtnContainer.classList.remove("hidden");
        } else {
          this.elements.playBtn.disabled = true;
        }
      };
    } catch (e: any) {
      console.error(e);
      this.elements.playBtn.classList.remove("playing");
      this.elements.playBtn.textContent = "Error";
    }
  }

  private async prepareTrial() {
    if (!this.currentBlock || !this.currentConfig || !this.trialRng) throw new Error("Runner not ready");
    
    // 1. Generate the trial structure (which interval is the target, etc)
    const { targetIndex, intervalPerturbations } = generateTrialState(
      this.currentBlock, 
      this.trialRng
    );
    this.currentTargetIndex = targetIndex;

    const adaptiveValue = this.staircase?.getCurrentValue();

    // 2. Map this to the structure the AudioEngine expects
    const intervals = this.currentBlock.paradigm.intervals.map((_, idx) => {
      const isTarget = idx === targetIndex;
      
      // Filter generators for this interval
      const generators = this.currentBlock!.stimuli.filter(gen => {
        const applyTo = (gen as any).applyTo || "all";
        if (applyTo === "all") return true;
        if (isTarget && applyTo === "target") return true;
        if (!isTarget && applyTo === "reference") return true;
        return false;
      });

      // Filter block-level perturbations for this interval
      const perturbations = (this.currentBlock!.perturbations || []).filter(p => {
        const applyTo = (p as any).applyTo || "target";
        if (applyTo === "all") return true;
        if (isTarget && applyTo === "target") return true;
        return false;
      });

      return {
        generators,
        perturbations: [
          ...perturbations,
          ...intervalPerturbations[idx]
        ]
      };
    });

    return await this.engine.renderTrial(
      intervals,
      this.currentBlock.paradigm.timing.isiMs,
      adaptiveValue,
      this.currentConfig.calibration,
      this.currentConfig.globalLevelDb
    );
  }

  private highlightIntervals(lengths: number[], startTime: number) {
    let currentTime = startTime;
    const isi = (this.currentBlock?.paradigm.timing.isiMs || 0) / 1000;
    const responseDelay = (this.currentBlock?.paradigm.timing.responseDelayMs || 250) / 1000;

    const now = this.engine.getTime();
    lengths.forEach((len, idx) => {
      const btn = this.responseButtons[idx];
      if (!btn) {
        currentTime += len + isi;
        return;
      }
      const startDelay = (currentTime - now) * 1000;
      const endDelay = (currentTime + len - now) * 1000;
      
      if (startDelay <= 0 && endDelay > 0) {
        // We are already in this interval, highlight immediately
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("active"), endDelay);
      } else if (startDelay > 0) {
        // Future interval
        setTimeout(() => btn.classList.add("active"), startDelay);
        setTimeout(() => btn.classList.remove("active"), endDelay);
      }
      // If endDelay <= 0, the interval has already passed, do nothing.

      currentTime += len + isi;
    });

    const enableDelay = Math.max(0, (currentTime - isi + responseDelay - now) * 1000);
    setTimeout(() => {
      this.responseButtons.forEach(btn => {
        if (!btn.classList.contains("non-selectable")) {
          btn.disabled = false;
        }
      });
      this.isInputEnabled = true;
    }, enableDelay);
  }

  private handleResponse(index: number) {
    if (!this.isInputEnabled || !this.staircase || !this.currentBlock) {
      return;
    }
    this.isInputEnabled = false;
    
    this.responseButtons.forEach(btn => btn.disabled = true);
    
    const result = this.staircase.processResponse(index === this.currentTargetIndex, {
      targetIndex: this.currentTargetIndex,
      intervalStates: this.currentTrialMetadata
    });
    const isCorrect = result.correct;
    const isFinished = this.staircase.isFinished(this.currentBlock.termination);
    
    this.showFeedback(index, isCorrect);

    setTimeout(async () => {
      this.clearFeedback();
      if (isFinished) {
        // Calculate run index for blocks with the same ID
        const runIndex = this.sessionResults.filter(r => r.blockId === (this.currentBlock?.id)).length;

        const blockResult = {
          blockId: this.currentBlock?.id || `block_${this.currentBlockIndex}`,
          history: this.staircase?.getHistory() || [],
          threshold: this.staircase?.calculateThreshold(this.currentBlock?.termination?.discardReversals) || 0,
          runIndex,
          presentationOrder: this.sessionResults.length + 1,
          startTime: this.currentBlockStartTime,
          endTime: new Date().toISOString()
        };

        this.sessionResults.push(blockResult);

        // Dispatch lifecycle event for progressive saving
        this.container.dispatchEvent(new CustomEvent('block-complete', {
          detail: {
            experiment: this.currentConfig?.meta.name,
            blockResult,
            sessionResults: this.sessionResults,
            actualSeed: this.activeSeed
          },
          bubbles: true,
          composed: true
        }));

        if (this.currentBlockIndex < (this.blockQueue.length - 1)) {
          this.saveBackup();
          await this.startBlock(this.currentBlockIndex + 1);
        } else {
          this.showResults();
        }
      } else {
        this.updateStatus();
        this.preRenderedTrial = this.prepareTrial();
        const iti = this.currentBlock?.paradigm.timing.itiMs || 1000;
        const startTime = this.engine.getTime() + (iti / 1000);
        this.playNextTrial(startTime);
      }
    }, (this.currentBlock?.paradigm.timing.feedbackDurationMs ?? 400));
  }

  private showFeedback(index: number, isCorrect: boolean) {
    if (!this.currentBlock?.feedback) return;
    const btn = this.responseButtons[index];
    btn.classList.add(isCorrect ? "correct" : "incorrect");
  }

  private clearFeedback() {
    this.responseButtons.forEach(btn => {
      btn.classList.remove("correct", "incorrect", "active");
    });
  }

  private updateStatus() {
    if (!this.staircase || !this.currentBlock || !this.currentConfig) return;
    
    const configUI = this.currentConfig.ui || {};
    const blockUI = this.currentBlock.ui || {};
    
    // Explicitly merge: Block overrides Global overrides Default
    const showTrial = blockUI.showTrialNumber ?? configUI.showTrialNumber ?? true;
    const showValue = blockUI.showCurrentValue ?? configUI.showCurrentValue ?? false;
    const showReversals = blockUI.showReversals ?? configUI.showReversals ?? false;

    const history = this.staircase.getHistory();
    const trialNum = history.length + 1;
    const reversals = this.staircase.getReversalCount();
    const currentValue = this.staircase.getCurrentValue();

    let status = "";
    if (showTrial) status += `Trial: ${trialNum}  `;
    if (showReversals) status += `Reversals: ${reversals}  `;
    if (showValue) {
      const unit = this.currentBlock.adaptive?.unit || "";
      status += `Value: ${currentValue.toFixed(2)}${unit ? " " + unit : ""}`;
    }

    this.elements.statusBadge.textContent = status;
    this.elements.statusBadge.classList.toggle("hidden", !status);
  }

  private showResults() {
    this.elements.playBtnContainer.classList.add("hidden");
    this.elements.responseButtonsContainer.innerHTML = "";
    this.elements.statusBadge.classList.add("hidden");
    this.elements.instructionText.classList.add("hidden");
    this.elements.infoArea.classList.add("hidden");
    this.elements.mainArea.classList.add("hidden");
    this.elements.resultsArea.classList.remove("hidden");

    if (this.currentConfig?.meta.autoSave && !this.options.disableAutoSave) {
      this.clearBackup(this.currentConfig.meta.name);
    }
    
    // For UI display, we'll just show the threshold of the final block (or 0 if none)
    const finalThreshold = this.sessionResults.length > 0 
      ? this.sessionResults[this.sessionResults.length - 1].threshold 
      : 0;
      
    const unit = this.currentBlock?.adaptive?.unit || "";
    this.elements.resultsText.textContent = `Estimated Threshold: ${finalThreshold.toFixed(2)}${unit ? " " + unit : ""}`;

    // Dispatch custom event for host integration, providing ALL block results
    this.container.dispatchEvent(new CustomEvent('experiment-complete', {
      detail: {
        experiment: this.currentConfig?.meta.name,
        threshold: finalThreshold,
        results: this.sessionResults, // Send all blocks
        actualSeed: this.activeSeed,
        config: this.currentConfig
      },
      bubbles: true,
      composed: true
    }));
  }

  private handleDownload() {
    if (!this.currentConfig) return;
    const data = {
      timestamp: new Date().toISOString(),
      experimentName: this.currentConfig.meta.name,
      actualSeed: this.activeSeed,
      results: this.sessionResults // Send all blocks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results_${this.currentConfig.meta.name.replace(/\s+/g, "_")}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Backup Logic ---

  private getBackup(name: string): any | null {
    const data = localStorage.getItem(`psycho_lab_backup_${name}`);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private saveBackup() {
    if (!this.currentConfig || !this.currentConfig.meta.autoSave || this.options.disableAutoSave) return;
    const backup = {
      seed: this.activeSeed,
      results: this.sessionResults,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(`psycho_lab_backup_${this.currentConfig.meta.name}`, JSON.stringify(backup));
  }

  private clearBackup(name: string) {
    localStorage.removeItem(`psycho_lab_backup_${name}`);
  }
}
