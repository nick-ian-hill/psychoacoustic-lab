import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private worker: Worker;
  private pendingRequests: Map<string, (res: { buffer: AudioBuffer; intervalLengths: number[] }) => void> = new Map();
  private seed: number;

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
    
    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.worker.postMessage({
        id,
        intervals,
        isiMs,
        sampleRate: this.ctx.sampleRate,
        seed: this.seed,
        adaptiveValue,
        calibration,
        globalLevelDb
      });
    });
  }

  async playBuffer(buffer: AudioBuffer): Promise<{ source: AudioBufferSourceNode; startTime: number }> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    // Capture AudioContext time 100ms in the future so highlight timers can align to a fixed point
    const startTime = this.ctx.currentTime + 0.1;
    source.start(startTime);
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
