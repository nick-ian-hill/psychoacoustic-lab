import seedrandom from "seedrandom";
import type { StimulusGenerator, Perturbation } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private rng: seedrandom.PRNG;

  constructor(sampleRate: number, seed: number) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate,
    });
    this.rng = seedrandom(seed.toString());
  }

  /**
   * Render a complete trial sequence into a single AudioBuffer
   */
  async renderTrial(
    intervals: { generator: StimulusGenerator; perturbations?: Perturbation[] }[],
    isiMs: number
  ): Promise<AudioBuffer> {
    const renderedIntervals: AudioBuffer[] = [];
    for (const interval of intervals) {
      renderedIntervals.push(await this.synthesizeStimulus(interval.generator, interval.perturbations));
    }

    const totalLength = renderedIntervals.reduce((acc, buf) => acc + buf.length, 0) + 
                       (intervals.length - 1) * (isiMs / 1000) * this.ctx.sampleRate;
    
    const trialBuffer = this.ctx.createBuffer(1, Math.ceil(totalLength), this.ctx.sampleRate);
    const data = trialBuffer.getChannelData(0);

    let offset = 0;
    for (let i = 0; i < renderedIntervals.length; i++) {
      data.set(renderedIntervals[i].getChannelData(0), offset);
      offset += renderedIntervals[i].length;
      if (i < renderedIntervals.length - 1) {
        offset += (isiMs / 1000) * this.ctx.sampleRate;
      }
    }

    return trialBuffer;
  }

  private async synthesizeStimulus(
    gen: StimulusGenerator,
    perturbations?: Perturbation[]
  ): Promise<AudioBuffer> {
    const duration = gen.duration / 1000;
    const buffer = this.ctx.createBuffer(1, Math.ceil(duration * this.ctx.sampleRate), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (gen.type === "harmonic_complex") {
      this.synthesizeHarmonicComplex(data, gen, perturbations);
    } else if (gen.type === "tone") {
      this.synthesizeTone(data, gen, perturbations);
    }

    return buffer;
  }

  private synthesizeHarmonicComplex(
    data: Float32Array,
    gen: any,
    perturbations?: Perturbation[]
  ) {
    const f0 = gen.f0;
    const { from, to } = gen.harmonics;
    const sampleRate = this.ctx.sampleRate;
    const durationSamples = data.length;

    for (let n = from; n <= to; n++) {
      let freq = n * f0;
      let amp = Math.pow(10, gen.amplitudeProfile.levelDb / 20);
      let phase = gen.phase === "random" ? this.rng() * 2 * Math.PI : 0;
      let onsetDelaySamples = 0;

      // Apply perturbations
      if (perturbations) {
        for (const p of perturbations) {
          if (p.type === "spectral_profile" && this.matchTarget(p.targetHarmonic, n)) {
            amp *= Math.pow(10, (p.deltaDb as number) / 20);
          }
          if (p.type === "onset_asynchrony" && this.matchTarget(p.targetHarmonic, n)) {
            onsetDelaySamples = ((p.delayMs as number) / 1000) * sampleRate;
          }
          if (p.type === "mistuning" && this.matchTarget(p.targetHarmonic, n)) {
            freq *= (1 + (p.deltaPercent as number) / 100);
          }
        }
      }

      // Generate harmonic
      for (let i = 0; i < durationSamples; i++) {
        const t = (i - onsetDelaySamples) / sampleRate;
        if (t < 0) continue;

        const envelope = this.calculateEnvelope(t, gen.duration / 1000, gen.envelope);
        data[i] += amp * envelope * Math.sin(2 * Math.PI * freq * t + phase);
      }
    }

    // Normalize to prevent clipping (conservative)
    const numHarmonics = to - from + 1;
    for (let i = 0; i < data.length; i++) {
      data[i] /= numHarmonics; 
    }
  }

  private synthesizeTone(data: Float32Array, gen: any, _perturbations?: Perturbation[]) {
    // Basic tone implementation
    const freq = typeof gen.frequency === "number" ? gen.frequency : 1000;
    const amp = Math.pow(10, gen.levelDb / 20);
    const sampleRate = this.ctx.sampleRate;

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = this.calculateEnvelope(t, gen.duration / 1000, gen.envelope);
      data[i] = amp * envelope * Math.sin(2 * Math.PI * freq * t);
    }
  }

  private calculateEnvelope(t: number, duration: number, env: { attack: number; release: number }) {
    const attack = env.attack / 1000;
    const release = env.release / 1000;
    if (t < attack) return t / attack;
    if (t > duration - release) return (duration - t) / release;
    if (t > duration) return 0;
    return 1;
  }

  private matchTarget(target: any, n: number): boolean {
    if (typeof target === "number") return target === n;
    if (target.random && target.random.type === "choice") {
       // Deterministic choice based on current RNG state? 
       // For simplicity, we assume target is resolved before synthesis or matched here
       return target.random.values.includes(n);
    }
    return false;
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
