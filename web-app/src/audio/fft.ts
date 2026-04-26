/**
 * Simple Radix-2 Cooley-Tukey IFFT.
 * Expected input lengths must be a power of 2.
 */
export function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if ((n & (n - 1)) !== 0) throw new Error("IFFT length must be a power of 2");

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let tempR = real[i];
      let tempI = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempR;
      imag[j] = tempI;
    }
    let m = n >> 1;
    while (m <= j) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey decimation-in-time radix-2
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const theta = (2 * Math.PI) / size;
    // IFFT uses positive exponent: e^(j*2*pi*k/N)
    const wRealStep = Math.cos(theta);
    const wImagStep = Math.sin(theta);

    for (let i = 0; i < n; i += size) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < halfSize; j++) {
        const k = i + j;
        const m = k + halfSize;
        
        // Complex multiplication: w * (real[m] + j*imag[m])
        const tr = wReal * real[m] - wImag * imag[m];
        const ti = wReal * imag[m] + wImag * real[m];

        real[m] = real[k] - tr;
        imag[m] = imag[k] - ti;
        
        real[k] += tr;
        imag[k] += ti;

        // Next twiddle factor
        const nextWReal = wReal * wRealStep - wImag * wImagStep;
        const nextWImag = wReal * wImagStep + wImag * wRealStep;
        wReal = nextWReal;
        wImag = nextWImag;
      }
    }
  }

  // Normalize
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] /= n;
  }
}

/**
 * Generates noise using an IFFT to shape the magnitude spectrum perfectly.
 * Returns a Float32Array of length `targetSamples`.
 * Uses zero-padding/truncation if targetSamples is not a power of 2.
 */
export function generateFFTNoise(
  targetSamples: number,
  sampleRate: number,
  type: "white" | "pink" | "brown",
  bandLimit?: { lowFreq: number; highFreq: number },
  rng?: () => number,
  getCalibrationOffset?: (f: number) => number
): Float32Array {
  const random = rng || Math.random;
  
  // Find next power of 2
  let n = 1;
  while (n < targetSamples) n <<= 1;
  
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  
  const binFreq = sampleRate / n;
  const nyquist = n / 2;

  const lowFreq = bandLimit?.lowFreq || 0;
  const highFreq = bandLimit?.highFreq || (sampleRate / 2);

  // DC offset
  real[0] = 0;
  imag[0] = 0;
  // Nyquist bin
  real[nyquist] = 0;
  imag[nyquist] = 0;

  // Fill positive frequencies
  for (let i = 1; i < nyquist; i++) {
    const f = i * binFreq;
    
    // Brick-wall band limiting
    if (f < lowFreq || f > highFreq) {
      real[i] = 0;
      imag[i] = 0;
      continue;
    }

    // Magnitude shaping
    let mag = 1; // white
    if (type === "pink") {
      mag = 1 / Math.sqrt(f);
    } else if (type === "brown") {
      mag = 1 / f;
    }

    if (getCalibrationOffset) {
      const offsetDb = getCalibrationOffset(f);
      mag *= Math.pow(10, offsetDb / 20);
    }

    // Random phase
    const phase = random() * 2 * Math.PI;
    
    // Create complex number from polar
    real[i] = mag * Math.cos(phase);
    imag[i] = mag * Math.sin(phase);
  }

  // Fill negative frequencies (complex conjugate to ensure real output)
  for (let i = 1; i < nyquist; i++) {
    real[n - i] = real[i];
    imag[n - i] = -imag[i];
  }

  // Perform IFFT
  ifft(real, imag);

  // The result is real[] (imag[] should be practically 0 due to conjugacy)
  // We need to return exactly `targetSamples` length.
  const result = new Float32Array(targetSamples);
  
  // Also, normalize the result so its RMS or peak is somewhat predictable.
  // We'll normalize to a peak of ~1.0 for the generated segment, 
  // and the engine will apply the actual desired dB level.
  let peak = 0;
  for (let i = 0; i < targetSamples; i++) {
    const val = real[i];
    if (Math.abs(val) > peak) peak = Math.abs(val);
    result[i] = val;
  }

  if (peak > 0) {
    for (let i = 0; i < targetSamples; i++) {
      result[i] /= peak;
    }
  }

  return result;
}
