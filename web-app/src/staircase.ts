export class Staircase {
  private rules: { correctDown: number; incorrectUp: number };
  private stepSizes: number[];
  private minVal: number;
  private maxVal: number;
  
  public currentValue: number;
  public reversals: number = 0;
  
  private stepIndex: number = 0;
  private consecutiveCorrect: number = 0;
  private consecutiveIncorrect: number = 0;
  private lastDirection: "up" | "down" | null = null;
  private track: { trial: number; value: number; correct: boolean }[] = [];
  
  constructor(config: {
    initialValue: number;
    stepSizes: number[];
    rule: { correctDown: number; incorrectUp: number };
    minValue: number;
    maxValue: number;
  }) {
    this.currentValue = config.initialValue;
    this.stepSizes = config.stepSizes;
    this.rules = config.rule;
    this.minVal = config.minValue;
    this.maxVal = config.maxValue;
  }

  public recordResponse(correct: boolean) {
    this.track.push({ trial: this.track.length + 1, value: this.currentValue, correct });

    if (correct) {
      this.consecutiveCorrect++;
      this.consecutiveIncorrect = 0;

      if (this.consecutiveCorrect >= this.rules.correctDown) {
        this.consecutiveCorrect = 0;
        this.stepDown();
      }
    } else {
      this.consecutiveIncorrect++;
      this.consecutiveCorrect = 0;

      if (this.consecutiveIncorrect >= this.rules.incorrectUp) {
        this.consecutiveIncorrect = 0;
        this.stepUp();
      }
    }
  }

  private stepDown() {
    this.checkReversal("down");
    this.currentValue -= this.stepSizes[this.stepIndex];
    this.clamp();
  }

  private stepUp() {
    this.checkReversal("up");
    this.currentValue += this.stepSizes[this.stepIndex];
    this.clamp();
  }

  private checkReversal(direction: "up" | "down") {
    if (this.lastDirection !== null && this.lastDirection !== direction) {
      this.reversals++;
      if (this.stepIndex < this.stepSizes.length - 1) {
        this.stepIndex++; // Reduce step size on reversal if possible
      }
    }
    this.lastDirection = direction;
  }

  private clamp() {
    if (this.currentValue < this.minVal) this.currentValue = this.minVal;
    if (this.currentValue > this.maxVal) this.currentValue = this.maxVal;
  }

  public getHistory() {
    return this.track;
  }
}
