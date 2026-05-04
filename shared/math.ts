/**
 * Minimal seeded PRNG (Mulberry32)
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * [Tier 3: Primitive] Calculate frequency components.
 * Supports Linear, Log, ERB, and Stretched (Inharmonic) spacing.
 */
export function internalCalcFrequencies(
  type: "linear" | "log" | "erb" | "stretched", 
  minFreq: number, 
  maxFreq: number, 
  numComponents: number, 
  inharmonicityB: number = 0
): number[] {
  const freqs: number[] = [];
  if (numComponents === 1) return [minFreq];

  if (type === "linear") {
    const step = (maxFreq - minFreq) / (numComponents - 1);
    for (let i = 0; i < numComponents; i++) freqs.push(minFreq + i * step);
  } else if (type === "log") {
    const logStart = Math.log10(minFreq);
    const logEnd = Math.log10(maxFreq);
    const step = (logEnd - logStart) / (numComponents - 1);
    for (let i = 0; i < numComponents; i++) freqs.push(Math.pow(10, logStart + i * step));
  } else if (type === "erb") {
    const hzToErb = (hz: number) => 21.4 * Math.log10(4.37 * (hz / 1000) + 1);
    const erbToHz = (erb: number) => ((Math.pow(10, erb / 21.4) - 1) / 4.37) * 1000;
    const startErb = hzToErb(minFreq);
    const endErb = hzToErb(maxFreq);
    const step = (endErb - startErb) / (numComponents - 1);
    for (let i = 0; i < numComponents; i++) freqs.push(erbToHz(startErb + i * step));
  } else if (type === "stretched") {
    const f0 = minFreq;
    for (let k = 1; k <= numComponents; k++) {
      freqs.push(f0 * k * Math.sqrt(1 + inharmonicityB * (k * k - 1)));
    }
  }
  return freqs.map(f => parseFloat(f.toFixed(3)));
}

/**
 * [Tier 3: Primitive] Calculate starting phases in DEGREES.
 */
export function internalCalcPhases(
  type: "sine" | "random" | "schroeder_positive" | "schroeder_negative", 
  numComponents: number, 
  seed?: number
): number[] {
  const phases: number[] = [];
  if (type === "sine") {
    for (let i = 0; i < numComponents; i++) phases.push(0);
  } else if (type === "random") {
    if (seed === undefined) throw new Error("A 'seed' is required for random phases.");
    const rng = mulberry32(seed);
    for (let i = 0; i < numComponents; i++) phases.push(rng() * 360);
  } else if (type.startsWith("schroeder")) {
    const sign = type === "schroeder_positive" ? 1 : -1;
    for (let k = 1; k <= numComponents; k++) {
      const rad = sign * Math.PI * k * (k - 1) / numComponents;
      phases.push((rad * 180 / Math.PI) % 360);
    }
  }
  return phases.map(p => parseFloat(p.toFixed(2)));
}

/**
 * [Tier 3: Primitive] Calculate component levels in dB SPL.
 */
export function internalCalcAmplitudes(
  type: "flat" | "pink_noise_tilt", 
  baseLevelDb: number, 
  numComponents: number, 
  frequencies?: number[]
): number[] {
  const levels: number[] = [];
  if (type === "flat") {
    for (let i = 0; i < numComponents; i++) levels.push(baseLevelDb);
  } else if (type === "pink_noise_tilt") {
    if (frequencies && frequencies.length === numComponents) {
      const f0 = frequencies[0];
      for (let i = 0; i < numComponents; i++) {
        const octaves = Math.log2(frequencies[i] / f0);
        levels.push(baseLevelDb - 3 * octaves);
      }
    } else {
      for (let i = 0; i < numComponents; i++) {
        levels.push(baseLevelDb - 10 * Math.log10(i + 1));
      }
    }
  }
  return levels.map(l => parseFloat(l.toFixed(2)));
}
