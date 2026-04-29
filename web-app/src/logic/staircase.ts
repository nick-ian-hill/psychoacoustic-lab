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

  constructor(config?: AdaptiveConfig) {
    this.config = config || {} as any;
    this.currentValue = config ? config.initialValue : 0;
    this.currentStepIndex = 0;
    this.isFastStarting = config ? ((config.initialN || 1) < config.rule.correctDown) : false;
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
      const targetN = (this.config.rule) 
        ? (this.isFastStarting ? (this.config.initialN || 1) : this.config.rule.correctDown)
        : Infinity; // Never step down if no rules defined
      
      if (this.consecutiveCorrect >= targetN && this.config.stepSizes) {
        if (this.config.stepType === "geometric") {
          this.currentValue /= this.getStepSize();
        } else {
          this.currentValue -= this.getStepSize();
        }
        this.consecutiveCorrect = 0;
        
        if (this.lastDirection === "up") {
          isReversal = true;
          this.reversalCount++;
          this.handleReversal();
        }
        this.lastDirection = "down";
      }
    } else {
      if (this.config.stepSizes) {
        if (this.config.stepType === "geometric") {
          this.currentValue *= this.getStepSize();
        } else {
          this.currentValue += this.getStepSize();
        }
        
        if (this.lastDirection === "down") {
          isReversal = true;
          this.reversalCount++;
          this.handleReversal();
        }
        this.lastDirection = "up";
      }
      this.consecutiveCorrect = 0;
    }

    // Bounds check
    if (this.config.minValue !== undefined) {
      this.currentValue = Math.max(this.config.minValue, Math.min(this.config.maxValue, this.currentValue));
    }

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
    const interval = this.config.stepSizeInterval || 1;
    if (this.reversalCount % interval === 0 && this.config.stepSizes) {
      if (this.currentStepIndex < this.config.stepSizes.length - 1) {
        this.currentStepIndex++;
      }
    }
  }

  isFinished(termination?: { maxTrials?: number; reversals?: number; correctTrials?: number }): boolean {
    if (!termination) return false;
    if (termination.reversals && this.reversalCount >= termination.reversals) return true;
    if (termination.maxTrials && this.history.length >= termination.maxTrials) return true;
    if (termination.correctTrials) {
      const correctCount = this.history.filter(h => h.correct).length;
      if (correctCount >= termination.correctTrials) return true;
    }
    return false;
  }

  calculateThreshold(discardCount: number = 4): number {
    const reversals = this.history.filter(h => h.isReversal);
    const validReversals = reversals.slice(discardCount);
    if (validReversals.length === 0) return this.currentValue;
    
    const sum = validReversals.reduce((acc, r) => acc + r.value, 0);
    const arithmeticMean = sum / validReversals.length;

    if (this.config.stepType === "geometric") {
      // Geometric mean: exp(mean(log(values)))
      // Safety: filter out zero/negative values just in case, though they shouldn't exist in geometric mode
      const positiveValues = validReversals.map(r => r.value).filter(v => v > 0);
      if (positiveValues.length === 0) return arithmeticMean;
      const logSum = positiveValues.reduce((acc, v) => acc + Math.log(v), 0);
      return Math.exp(logSum / positiveValues.length);
    }

    return arithmeticMean;
  }

  getHistory() {
    return this.history;
  }
}
