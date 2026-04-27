import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private worker: Worker;
  private pendingRequests: Map<string, (res: { buffer: AudioBuffer; intervalLengths: number[] }) => void> = new Map();
  private seed: number;
  // Incremented each renderTrial call so every trial gets a unique seed.
  // This prevents noise realizations and roving values from being identical across trials.
  private renderCount: number = 0;

  constructor(sampleRate: number, seed: number) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate,
    });
    this.seed = seed;

    // Initialize the Web Worker
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
        resolve({ buffer, intervalLengths });
      }
    };
  }

  async renderTrial(
    intervals: { generators: StimulusGenerator[]; perturbations?: Perturbation[] }[],
    isiMs: number,
    adaptiveValue?: number,
    calibration?: CalibrationProfile,
    globalLevelDb?: number
  ): Promise<{ buffer: AudioBuffer; intervalLengths: number[] }> {
    const id = Math.random().toString(36).substring(7);
    // Derive a per-trial seed: master seed + monotonically increasing render count.
    // This ensures each trial's noise realization and roving draws are unique.
    const trialSeed = this.seed + this.renderCount++;
    
    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
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
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async playBuffer(buffer: AudioBuffer): Promise<{ source: AudioBufferSourceNode; startTime: number }> {
    await this.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const scheduledAt = this.ctx.currentTime;
    source.start(scheduledAt);
    // Return the *perceptual* start time: when audio actually reaches the listener's ears.
    // outputLatency accounts for hardware buffering (typically 5–50 ms on desktop,
    // up to 100 ms on mobile). The highlight loop compares ctx.currentTime against this
    // value, so interval buttons illuminate in sync with perceived audio onset.
    const startTime = scheduledAt + this.getOutputLatency();
    return { source, startTime };
  }

  getOutputLatency(): number {
    // outputLatency is the hardware round-trip; baseLatency is the API buffer.
    // Both are available in modern browsers; fall back to 0 if not.
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  getTime(): number {
    return this.ctx.currentTime;
  }
}
