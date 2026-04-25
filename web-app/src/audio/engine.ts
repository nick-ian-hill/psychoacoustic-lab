import seedrandom from "seedrandom";
import type { StimulusGenerator, Perturbation, CalibrationProfile } from "../../../shared/schema";

export class AudioEngine {
  private ctx: AudioContext;
  private rng: seedrandom.PRNG;

  constructor(sampleRate: number, seed: number) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate,
    });
    this.rng = seedrandom(seed.toString());
  }

  async renderTrial(
    intervals: { generator: StimulusGenerator; perturbations?: Perturbation[] }[],
    isiMs: number,
    adaptiveValue?: number,
    calibration?: CalibrationProfile
  ): Promise<AudioBuffer> {
    const renderedIntervals: AudioBuffer[] = [];
    for (const interval of intervals) {
      renderedIntervals.push(await this.synthesizeStimulus(interval.generator, interval.perturbations, adaptiveValue, calibration));
    }

    const totalLength = renderedIntervals.reduce((acc, buf) => acc + buf.length, 0) + 
                       (intervals.length - 1) * (isiMs / 1000) * this.ctx.sampleRate;
    
    const trialBuffer = this.ctx.createBuffer(2, Math.ceil(totalLength), this.ctx.sampleRate);
    const leftData = trialBuffer.getChannelData(0);
    const rightData = trialBuffer.getChannelData(1);

    let offset = 0;
    for (let i = 0; i < renderedIntervals.length; i++) {
      const intervalBuffer = renderedIntervals[i];
      leftData.set(intervalBuffer.getChannelData(0), offset);
      rightData.set(intervalBuffer.getChannelData(1), offset);
      
      offset += intervalBuffer.length;
      if (i < renderedIntervals.length - 1) {
        offset += (isiMs / 1000) * this.ctx.sampleRate;
      }
    }

    return trialBuffer;
  }

  private async synthesizeStimulus(
    gen: StimulusGenerator,
    perturbations?: Perturbation[],
    adaptiveValue?: number,
    calibration?: CalibrationProfile
  ): Promise<AudioBuffer> {
    if (gen.type === "noise") {
      const duration = gen.durationMs / 1000;
      const buffer = this.ctx.createBuffer(2, Math.ceil(duration * this.ctx.sampleRate), this.ctx.sampleRate);
      this.synthesizeNoise(buffer, gen, perturbations, adaptiveValue);
      return buffer;
    }

    if (gen.type === "multi_component") {
      return this.synthesizeMultiComponent(gen, perturbations, adaptiveValue, calibration);
    }

    throw new Error(`Unknown generator type: ${(gen as any).type}`);
  }

  private synthesizeMultiComponent(
    gen: any,
    perturbations?: Perturbation[],
    adaptiveValue?: number,
    calibration?: CalibrationProfile
  ): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    
    let maxLeadMs = 0;
    if (perturbations) {
      for (const p of perturbations) {
        if (p.type === "onset_asynchrony") {
          const delay = typeof p.delayMs === 'object' ? (adaptiveValue || 0) : p.delayMs;
          if (delay < 0) maxLeadMs = Math.max(maxLeadMs, Math.abs(delay));
        }
      }
    }

    const globalDurationSamples = Math.ceil((gen.durationMs + maxLeadMs) / 1000 * sampleRate);
    const buffer = this.ctx.createBuffer(2, globalDurationSamples, sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    for (const comp of gen.components) {
      let freq = comp.frequency;
      let phase = (comp.phaseDegrees || 0) * Math.PI / 180;
      let onsetSamples = ((comp.onsetDelayMs || 0) + maxLeadMs) / 1000 * sampleRate;
      const ear = comp.ear || "both";

      // 1. Resolve Runtime Perturbations
      let pertAmpOffset = 0;
      if (perturbations) {
        for (const p of perturbations) {
          if (p.targetFrequency === comp.frequency) {
            if (p.type === "spectral_profile") {
              const delta = typeof p.deltaDb === 'object' ? (adaptiveValue || 0) : p.deltaDb;
              pertAmpOffset += delta;
            }
            if (p.type === "mistuning") {
              const delta = typeof p.deltaPercent === 'object' ? (adaptiveValue || 0) : p.deltaPercent;
              freq *= (1 + delta / 100);
            }
            if (p.type === "onset_asynchrony") {
              const delta = typeof p.delayMs === 'object' ? (adaptiveValue || 0) : p.delayMs;
              onsetSamples += (delta / 1000) * sampleRate;
            }
            if (p.type === "phase_shift") {
              const delta = typeof p.deltaDegrees === 'object' ? (adaptiveValue || 0) : p.deltaDegrees;
              phase += delta * Math.PI / 180;
            }
          }
        }
      }

      // 2. Apply Hardware Calibration
      const calibrationOffset = this.getCalibrationOffset(freq, calibration);
      const finalDigitalDb = comp.levelDb + pertAmpOffset + calibrationOffset;
      const amp = Math.pow(10, finalDigitalDb / 20);

      // 3. Synthesis
      for (let i = 0; i < globalDurationSamples; i++) {
        const t = (i - onsetSamples) / sampleRate;
        if (t < 0 || t > gen.durationMs / 1000) continue;

        const envelope = this.calculateEnvelope(t, gen.durationMs / 1000, gen.globalEnvelope);
        const sample = amp * envelope * Math.sin(2 * Math.PI * freq * t + phase);

        if (ear === "left" || ear === "both") leftData[i] += sample;
        if (ear === "right" || ear === "both") rightData[i] += sample;
      }
    }

    this.normalizeStereo(buffer);

    return buffer;
  }

  private getCalibrationOffset(frequency: number, calibration?: CalibrationProfile): number {
    if (!calibration || calibration.points.length === 0) return 0;
    
    const pts = calibration.points.sort((a, b) => a.frequency - b.frequency);
    
    // If frequency is outside the bounds, clamp to the nearest point
    if (frequency <= pts[0].frequency) return pts[0].offsetDb;
    if (frequency >= pts[pts.length - 1].frequency) return pts[pts.length - 1].offsetDb;

    // Find the surrounding points
    for (let i = 0; i < pts.length - 1; i++) {
      if (frequency >= pts[i].frequency && frequency <= pts[i+1].frequency) {
        const p1 = pts[i];
        const p2 = pts[i+1];
        
        // Interpolate based on log10 of frequency
        const logF = Math.log10(frequency);
        const logF1 = Math.log10(p1.frequency);
        const logF2 = Math.log10(p2.frequency);
        
        const fraction = (logF - logF1) / (logF2 - logF1);
        return p1.offsetDb + fraction * (p2.offsetDb - p1.offsetDb);
      }
    }
    return 0;
  }

  private synthesizeNoise(buffer: AudioBuffer, gen: any, perturbations?: Perturbation[], adaptiveValue?: number) {
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);
    const amp = Math.pow(10, gen.levelDb / 20);
    const sampleRate = this.ctx.sampleRate;
    const ear = gen.ear || "both";

    for (let i = 0; i < leftData.length; i++) {
      const t = i / sampleRate;
      const envelope = this.calculateEnvelope(t, gen.durationMs / 1000, gen.envelope);
      let sample = (this.rng() * 2 - 1) * amp * envelope;

      if (perturbations) {
        for (const p of perturbations) {
          if (p.type === "spectral_profile") {
            const targetFreq = 1000;
            const delta = typeof p.deltaDb === 'object' ? (adaptiveValue || 0) : p.deltaDb;
            const toneAmp = Math.pow(10, delta / 20) * (amp / 10);
            sample += toneAmp * envelope * Math.sin(2 * Math.PI * targetFreq * t);
          }
        }
      }
      
      if (ear === "left" || ear === "both") leftData[i] = sample;
      if (ear === "right" || ear === "both") rightData[i] = sample;
    }

    this.normalizeStereo(buffer);
  }

  private normalizeStereo(buffer: AudioBuffer) {
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);
    
    let peak = 0;
    for (let i = 0; i < leftData.length; i++) {
      peak = Math.max(peak, Math.abs(leftData[i]), Math.abs(rightData[i]));
    }

    if (peak > 1.0) {
      console.warn(`[AudioEngine] Stereo Clipping detected (Peak: ${peak.toFixed(2)}). Applying ILD-preserving normalization.`);
      for (let i = 0; i < leftData.length; i++) {
        leftData[i] /= peak;
        rightData[i] /= peak;
      }
    }
  }

  private calculateEnvelope(t: number, durationSec: number, env: { attackMs: number; releaseMs: number }) {
    const attack = env.attackMs / 1000;
    const release = env.releaseMs / 1000;
    if (t < attack) return t / attack;
    if (t > durationSec - release) return (durationSec - t) / release;
    if (t > durationSec) return 0;
    return 1;
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
