import type { AdaptiveConfig } from "../../../shared/schema";

export type TrialResult = {
  trialIndex: number;
  value: number;
  correct: boolean;
  isReversal: boolean;
  metadata?: any;
};

export class StaircaseController {
  private config: AdaptiveConfig;
  private currentValue: number;
  private currentStepIndex: number;
  private history: TrialResult[] = [];
  private consecutiveCorrect: number = 0;
  private reversalCount: number = 0;
  private lastDirection: "up" | "down" | null = null;
  private isFastStarting: boolean;

  constructor(config: AdaptiveConfig) {
    this.config = config;
    this.currentValue = config.initialValue;
    this.currentStepIndex = 0;
    this.isFastStarting = (config.initialN || 1) < config.rule.correctDown;
  }

  getCurrentValue(): number {
    return this.currentValue;
  }

  getReversalCount(): number {
    return this.reversalCount;
  }

  processResponse(correct: boolean, metadata?: any): TrialResult {
    let isReversal = false;
    const previousValue = this.currentValue;

    if (correct) {
      this.consecutiveCorrect++;
      const targetN = this.isFastStarting ? (this.config.initialN || 1) : this.config.rule.correctDown;
      
      if (this.consecutiveCorrect >= targetN) {
        this.currentValue -= this.getStepSize();
        this.consecutiveCorrect = 0;
        
        if (this.lastDirection === "up") {
          isReversal = true;
          this.reversalCount++;
          this.handleReversal();
        }
        this.lastDirection = "down";
      }
    } else {
      this.currentValue += this.getStepSize();
      this.consecutiveCorrect = 0;
      
      if (this.lastDirection === "down") {
        isReversal = true;
        this.reversalCount++;
        this.handleReversal();
      }
      this.lastDirection = "up";
    }

    // Bounds check
    this.currentValue = Math.max(this.config.minValue, Math.min(this.config.maxValue, this.currentValue));

    const result: TrialResult = {
      trialIndex: this.history.length,
      value: previousValue,
      correct,
      isReversal,
      metadata
    };

    this.history.push(result);
    return result;
  }

  private getStepSize(): number {
    return this.config.stepSizes[Math.min(this.currentStepIndex, this.config.stepSizes.length - 1)];
  }

  private handleReversal() {
    // Check if we should stop fast starting
    if (this.isFastStarting && this.reversalCount >= (this.config.switchReversalCount || 2)) {
      this.isFastStarting = false;
    }

    // Advance step size if needed (e.g. every reversal or every N reversals)
    // Simple heuristic: advance step size index on each reversal until last
    if (this.currentStepIndex < this.config.stepSizes.length - 1) {
      this.currentStepIndex++;
    }
  }

  isFinished(termination: { maxTrials?: number; reversals?: number }): boolean {
    if (termination.reversals && this.reversalCount >= termination.reversals) return true;
    if (termination.maxTrials && this.history.length >= termination.maxTrials) return true;
    return false;
  }

  calculateThreshold(discardCount: number = 4): number {
    const reversals = this.history.filter(h => h.isReversal);
    const validReversals = reversals.slice(discardCount);
    if (validReversals.length === 0) return this.currentValue;
    
    const sum = validReversals.reduce((acc, r) => acc + r.value, 0);
    return sum / validReversals.length;
  }

  getHistory() {
    return this.history;
  }
}
