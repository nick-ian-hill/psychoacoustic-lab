import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema.js";

export class AudioEngine {
  private ctx: AudioContext;
  private worker: Worker;
  private pendingRequests: Map<string, (res: { buffer: AudioBuffer; intervalLengths: number[]; resolvedPerturbations?: any[] }) => void> = new Map();
  private seed: number;
  private renderCount: number = 0;

  constructor(seed: number) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.seed = seed;

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (event) => {
      const { id, left, right, intervalLengths } = event.data;
      const resolve = this.pendingRequests.get(id);
      if (resolve) {
        const buffer = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        this.pendingRequests.delete(id);
        
        const lengthsInSeconds = intervalLengths.map((samples: number) => samples / this.ctx.sampleRate);
        resolve({ buffer, intervalLengths: lengthsInSeconds, resolvedPerturbations: event.data.resolvedPerturbations });
      }
    };
  }

  public setBaseSeed(seed: number) {
    this.seed = seed;
    this.renderCount = 0;
  }

  async renderTrial(
    intervals: { generators: StimulusGenerator[]; perturbations?: Perturbation[] }[],
    isiMs: number,
    adaptiveValue?: number,
    calibration?: CalibrationProfile,
    globalLevelDb?: number,
    timeoutMs: number = 10000
  ): Promise<{ buffer: AudioBuffer; intervalLengths: number[]; resolvedPerturbations?: any[] }> {
    const id = Math.random().toString(36).substring(7);
    const trialSeed = this.seed + this.renderCount++;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Synthesis timeout: The audio worker took too long to respond."));
      }, timeoutMs);

      this.pendingRequests.set(id, (res) => {
        clearTimeout(timeout);
        resolve(res);
      });

      this.worker.postMessage({
        id,
        intervals,
        isiMs,
        sampleRate: this.ctx.sampleRate,
        seed: trialSeed,
        adaptiveValue,
        calibration,
        globalLevelDb
      });
    });
  }

  async resume() {
    const resumePromise = this.ctx.resume();
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 500));
    await Promise.race([resumePromise, timeoutPromise]);
  }

  async playBuffer(
    buffer: AudioBuffer,
    scheduledTime?: number
  ): Promise<{ source: AudioBufferSourceNode; startTime: number }> {
    await this.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const preciseStartTime = scheduledTime ?? (this.ctx.currentTime + this.getOutputLatency());
    source.start(preciseStartTime);
    return { source, startTime: preciseStartTime };
  }

  getOutputLatency(): number {
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  async close() {
    if (this.ctx.state !== 'closed') {
      await this.ctx.close();
    }
    this.worker.terminate();
  }

  getTime(): number {
    return this.ctx.currentTime;
  }
}
