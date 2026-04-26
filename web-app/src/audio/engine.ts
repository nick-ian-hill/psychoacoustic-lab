import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private worker: Worker;
  private pendingRequests: Map<string, (buf: AudioBuffer) => void> = new Map();
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
      const { id, left, right } = event.data;
      const resolve = this.pendingRequests.get(id);
      if (resolve) {
        const buffer = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        this.pendingRequests.delete(id);
        resolve(buffer);
      }
    };
  }

  async renderTrial(
    intervals: { generators: StimulusGenerator[]; perturbations?: Perturbation[] }[],
    isiMs: number,
    adaptiveValue?: number,
    calibration?: CalibrationProfile,
    globalLevelDb?: number
  ): Promise<AudioBuffer> {
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

  playBuffer(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start();
    return source;
  }

  getTime(): number {
    return this.ctx.currentTime;
  }
}
