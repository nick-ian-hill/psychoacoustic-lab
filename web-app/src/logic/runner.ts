import { AudioEngine } from "../audio/engine.js";
import { StaircaseController } from "./staircase.js";
import { generateTrialState } from "./trial.js";
import type { ExperimentConfig, BlockConfig, Interval } from "../../../shared/schema.js";
import seedrandom from "seedrandom";

export class ExperimentRunner {
  private engine: AudioEngine;
  private staircase: StaircaseController | null = null;
  private currentConfig: ExperimentConfig | null = null;
  private currentBlockIndex = 0;
  private currentBlock: BlockConfig | null = null;
  private currentTargetIndex = -1;
  private trialRng: seedrandom.PRNG | null = null;
  private preRenderedTrial: Promise<{ buffer: AudioBuffer; intervalLengths: number[] }> | null = null;
  
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
  };
  
  private isInputEnabled: boolean = false;
  private responseButtons: HTMLButtonElement[] = [];
  private sessionResults: { blockId: string, history: any[], threshold: number }[] = [];
  private keyDownHandler: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
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
    };

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only trigger if we have a config AND the experiment screen is visible AND results are NOT visible
        const isExperimentActive = this.currentConfig && 
                                  !this.elements.experimentArea.classList.contains("hidden") && 
                                  this.elements.resultsArea.classList.contains("hidden");
        
        if (isExperimentActive) {
          this.showModal(
            "Cancel Experiment?", 
            "Are you sure you want to stop the current experiment? All progress in this session will be lost.",
            "Stop Experiment",
            () => this.cancel()
          );
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

  private setupListeners() {
    this.elements.playBtn.addEventListener("click", () => this.handlePlayClick());
    this.elements.downloadBtn.addEventListener("click", () => this.handleDownload());
    document.addEventListener("keydown", this.keyDownHandler);
  }

  public close() {
    if (this.engine) {
      this.engine.close();
      this.engine = null as any;
    }
  }

  public cancel() {
    this.close();
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

  private showModal(title: string, message: string, confirmText: string, onConfirm: () => void) {
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
            <button class="btn secondary" style="flex: 1;" id="modal-cancel">Keep Going</button>
            <button class="btn" style="flex: 1; background: var(--psycho-error);" id="modal-confirm">${confirmText}</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    const close = () => {
      this.isInputEnabled = wasInputEnabled;
      this.container.removeChild(modal);
    };

    modal.querySelector(".modal-close")?.addEventListener("click", close);
    modal.querySelector("#modal-cancel")?.addEventListener("click", close);
    modal.querySelector("#modal-confirm")?.addEventListener("click", () => {
      close();
      onConfirm();
    });
  }

  public async loadConfig(config: ExperimentConfig) {
    this.currentConfig = config;
    this.sessionResults = [];
    
    if (this.engine) {
      await this.engine.close();
    }
    
    // Initialize engine and RNG with the experiment's master seed
    this.engine = new AudioEngine(config.meta.seed);
    this.trialRng = seedrandom(config.meta.seed.toString());
    await this.startBlock(0);
  }

  private async startBlock(index: number) {
    if (!this.currentConfig) return;
    this.currentBlockIndex = index;
    this.currentBlock = this.currentConfig.blocks[index];
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

    this.elements.playBtnContainer.classList.add("hidden");
    this.elements.playBtn.disabled = true;
    this.elements.playBtn.classList.add("playing");
    this.responseButtons.forEach(btn => btn.disabled = true);

    const readyDelay = this.currentBlock?.paradigm.timing.readyDelayMs ?? 500;
    await new Promise(resolve => setTimeout(resolve, readyDelay));

    await this.playNextTrial();
  }

  private async playNextTrial(scheduledTime?: number) {
    if (!this.preRenderedTrial) {
      this.preRenderedTrial = this.prepareTrial();
    }

    try {
      const { buffer, intervalLengths } = await this.preRenderedTrial;
      this.preRenderedTrial = null;

      this.clearFeedback();
      const { source, startTime } = await this.engine.playBuffer(buffer, scheduledTime);
      this.highlightIntervals(intervalLengths, startTime);

      source.onended = () => {
        this.elements.playBtn.classList.remove("playing");
        this.elements.playBtn.disabled = true;
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
      return {
        generators: this.currentBlock!.stimuli,
        perturbations: [
          ...(this.currentBlock!.perturbations || []),
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
      const startDelay = (currentTime - now) * 1000;
      const endDelay = (currentTime + len - now) * 1000;
      
      setTimeout(() => btn.classList.add("active"), startDelay);
      setTimeout(() => btn.classList.remove("active"), endDelay);
      currentTime += len + isi;
    });

    const enableDelay = (currentTime - isi + responseDelay - now) * 1000;
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
    if (!this.isInputEnabled || !this.staircase || !this.currentBlock) return;
    this.isInputEnabled = false;
    
    this.responseButtons.forEach(btn => btn.disabled = true);
    
    const result = this.staircase.processResponse(index === this.currentTargetIndex);
    const isCorrect = result.correct;
    const isFinished = this.staircase.isFinished(this.currentBlock.termination);
    
    this.showFeedback(index, isCorrect);

    setTimeout(async () => {
      this.clearFeedback();
      if (isFinished) {
        this.sessionResults.push({
          blockId: this.currentBlock?.id || `block_${this.currentBlockIndex}`,
          history: this.staircase?.getHistory() || [],
          threshold: this.staircase?.calculateThreshold(this.currentBlock?.termination?.discardReversals) || 0
        });

        if (this.currentBlockIndex < (this.currentConfig?.blocks.length || 0) - 1) {
          await this.startBlock(this.currentBlockIndex + 1);
        } else {
          this.showResults();
        }
      } else {
        this.updateStatus();
        this.preRenderedTrial = this.prepareTrial();
        const nextTrialDelay = this.currentBlock?.paradigm.timing.itiMs || 1000;
        setTimeout(() => this.playNextTrial(), nextTrialDelay);
      }
    }, (this.currentBlock?.paradigm.timing.feedbackDurationMs || 400));
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
    this.elements.resultsArea.classList.remove("hidden");
    
    // For UI display, we'll just show the threshold of the final block (or 0 if none)
    const finalThreshold = this.sessionResults.length > 0 
      ? this.sessionResults[this.sessionResults.length - 1].threshold 
      : 0;
      
    const unit = this.currentBlock?.adaptive?.unit || "";
    this.elements.resultsText.textContent = `Experiment Complete. Estimated Threshold: ${finalThreshold.toFixed(2)}${unit ? " " + unit : ""}`;

    // Dispatch custom event for host integration, providing ALL block results
    this.container.dispatchEvent(new CustomEvent('experiment-complete', {
      detail: {
        experiment: this.currentConfig?.meta.name,
        threshold: finalThreshold,
        results: this.sessionResults, // Send all blocks
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
      seed: this.currentConfig.meta.seed,
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
}
