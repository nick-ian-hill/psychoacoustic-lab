import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private worker: Worker;
  private pendingRequests: Map<string, (res: { buffer: AudioBuffer; intervalLengths: number[] }) => void> = new Map();
  private seed: number;
  // Incremented each renderTrial call so every trial gets a unique seed.
  // This prevents noise realizations and roving values from being identical across trials.
  private renderCount: number = 0;

  constructor(seed: number) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.seed = seed;

    this.ctx.onstatechange = () => {
      console.log(`[AudioEngine] AudioContext state changed to: ${this.ctx.state}`);
    };

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
    globalLevelDb?: number,
    timeoutMs: number = 10000
  ): Promise<{ buffer: AudioBuffer; intervalLengths: number[] }> {
    const id = Math.random().toString(36).substring(7);
    // Derive a per-trial seed: master seed + monotonically increasing render count.
    // This ensures each trial's noise realization and roving draws are unique.
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
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
      console.log(`[AudioEngine] Attempting to resume context from ${this.ctx.state}...`);

      // On some mobile devices, resume() can hang indefinitely if called outside
      // a user-gesture context. We race it against a 2-second timeout so the
      // caller always gets a settled promise and can show a user-visible error.
      const resumePromise = this.ctx.resume();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AudioContext resume timed out — try tapping the Play button again")), 2000)
      );

      // Allow the rejection to propagate so playBuffer's caller can alert the user.
      await Promise.race([resumePromise, timeoutPromise]);
      console.log(`[AudioEngine] Resume successful. New state: ${this.ctx.state}`);
    }
  }

  async playBuffer(
    buffer: AudioBuffer,
    scheduledTime?: number
  ): Promise<{ source: AudioBufferSourceNode; startTime: number }> {
    await this.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    // If a precise start time is provided by the caller (AudioContext clock), use it directly.
    // Otherwise, schedule as soon as possible by adding output latency to the current time.
    // The scheduled time already incorporates any required latency offset when provided.
    const preciseStartTime = scheduledTime ?? (this.ctx.currentTime + this.getOutputLatency());
    source.start(preciseStartTime);

    return { source, startTime: preciseStartTime };
  }

  getOutputLatency(): number {
    // outputLatency is the hardware round-trip; baseLatency is the API buffer.
    // Both are available in modern browsers; fall back to 0 if not.
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  async close() {
    await this.ctx.close();
    this.worker.terminate();
  }

  getTime(): number {
    return this.ctx.currentTime;
  }
}
