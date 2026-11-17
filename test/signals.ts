/** Deterministic synthetic test signals. All return mono Float32Array at `sampleRate`. */

export const SR = 44100

function length(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate)
}

export function sine(hz: number, seconds: number, sampleRate = SR, amp = 1, phase = 0): Float32Array {
  const out = new Float32Array(length(seconds, sampleRate))
  const w = (2 * Math.PI * hz) / sampleRate
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin(w * i + phase)
  return out
}

/** Sum of harmonics `ks` of `f0`, each with amplitude `amps[k]` (default 1/k). Skips harmonics at or above Nyquist. */
export function harmonics(
  f0: number,
  ks: number[],
  seconds: number,
  sampleRate = SR,
  amps: (k: number) => number = (k) => 1 / k,
): Float32Array {
  const out = new Float32Array(length(seconds, sampleRate))
  for (const k of ks) {
    if (k * f0 >= sampleRate / 2) continue
    const w = (2 * Math.PI * k * f0) / sampleRate
    const a = amps(k)
    for (let i = 0; i < out.length; i++) out[i] += a * Math.sin(w * i)
  }
  return out
}

/** Band-limited sawtooth: harmonics 1..N below Nyquist, amplitude 1/k, scaled to peak ≈ `amp`. */
export function sawtooth(f0: number, seconds: number, sampleRate = SR, amp = 0.5): Float32Array {
  const count = Math.floor((sampleRate / 2 - 1) / f0)
  const ks = Array.from({ length: count }, (_, i) => i + 1)
  const out = harmonics(f0, ks, seconds, sampleRate)
  // Ideal sawtooth Fourier series sum peaks at π/2.
  const scale = amp / (Math.PI / 2)
  for (let i = 0; i < out.length; i++) out[i] *= scale
  return out
}

/** Mulberry32 PRNG: same seed, same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform white noise in [-amp, amp). */
export function noise(seconds: number, sampleRate = SR, seed = 1, amp = 0.5): Float32Array {
  const next = rng(seed)
  const out = new Float32Array(length(seconds, sampleRate))
  for (let i = 0; i < out.length; i++) out[i] = amp * (next() * 2 - 1)
  return out
}

export function silence(seconds: number, sampleRate = SR): Float32Array {
  return new Float32Array(length(seconds, sampleRate))
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

/** Sample-wise sum; length of the longest input. */
export function mix(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(Math.max(0, ...parts.map((p) => p.length)))
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i]
  return out
}

export function peakAbs(signal: Float32Array): number {
  let m = 0
  for (const v of signal) m = Math.max(m, Math.abs(v))
  return m
}

/** Goertzel magnitude at `hz`, normalised so a full-scale sine reads ≈ its amplitude. */
export function magnitudeAt(signal: Float32Array, hz: number, sampleRate = SR): number {
  const w = (2 * Math.PI * hz) / sampleRate
  const c = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (const x of signal) {
    const s0 = x + c * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / signal.length
}

/** Strongest frequency in [lo, hi], scanned in 0.5 Hz steps. */
export function strongest(signal: Float32Array, lo: number, hi: number, sampleRate = SR): number {
  let best = lo
  let bestMag = -1
  for (let hz = lo; hz <= hi; hz += 0.5) {
    const m = magnitudeAt(signal, hz, sampleRate)
    if (m > bestMag) [best, bestMag] = [hz, m]
  }
  return best
}
