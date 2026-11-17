import { fft } from './fft'

/** Pitch of one frame. `f0` is 0 when the frame is unvoiced. `clarity` is 0..1. */
export interface PitchFrame {
  f0: number
  clarity: number
}

export interface PitchOptions {
  minHz: number
  maxHz: number
  /** YIN absolute threshold on the normalised difference function. */
  threshold: number
}

export const DEFAULT_PITCH_OPTIONS: PitchOptions = { minHz: 40, maxHz: 2000, threshold: 0.15 }

export interface PitchSummary {
  pitched: boolean
  rootHz: number
  confidence: number
}

const UNVOICED: PitchFrame = { f0: 0, clarity: 0 }
const SILENCE_ENERGY = 1e-10
const MIN_VOICED_SHARE = 0.2

function nextPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(n))
}

/**
 * YIN difference function d(τ) = Σ_{j<n} (x_j − x_{j+τ})² for τ = 0..maxTau,
 * computed as energy terms minus 2 × the FFT cross-correlation of x[0..n) with x.
 */
function difference(frame: Float32Array, n: number, maxTau: number): Float64Array {
  const size = nextPow2(frame.length + n)
  const aRe = new Float64Array(size)
  const aIm = new Float64Array(size)
  const xRe = new Float64Array(size)
  const xIm = new Float64Array(size)
  for (let i = 0; i < n; i++) aRe[i] = frame[i]
  for (let i = 0; i < frame.length; i++) xRe[i] = frame[i]
  fft(aRe, aIm)
  fft(xRe, xIm)
  // conj(A)·X, then inverse FFT via conj(fft(conj(Y))) / size. Only the real part is needed.
  for (let k = 0; k < size; k++) {
    const re = aRe[k] * xRe[k] + aIm[k] * xIm[k]
    const im = aRe[k] * xIm[k] - aIm[k] * xRe[k]
    aRe[k] = re
    aIm[k] = -im
  }
  fft(aRe, aIm)

  const prefix = new Float64Array(frame.length + 1)
  for (let i = 0; i < frame.length; i++) prefix[i + 1] = prefix[i] + frame[i] * frame[i]
  const d = new Float64Array(maxTau + 1)
  for (let tau = 0; tau <= maxTau; tau++) {
    const r = aRe[tau] / size
    d[tau] = Math.max(0, prefix[n] + (prefix[tau + n] - prefix[tau]) - 2 * r)
  }
  return d
}

/** YIN pitch detection on one frame, with the difference function computed by FFT. */
export function detectPitch(frame: Float32Array, sampleRate: number, opts?: Partial<PitchOptions>): PitchFrame {
  const { minHz, maxHz, threshold } = { ...DEFAULT_PITCH_OPTIONS, ...opts }
  // Lags up to one period of minHz, but leave at least half the frame to integrate over.
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(frame.length / 2))
  const n = frame.length - maxTau

  let energy = 0
  for (let i = 0; i < n; i++) energy += frame[i] * frame[i]
  if (energy < SILENCE_ENERGY) return UNVOICED

  const d = difference(frame, n, maxTau)

  // Cumulative mean normalised difference d'(τ).
  const cmnd = new Float64Array(maxTau + 1)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1
  }

  // First dip under the threshold, then walk down to its local minimum. Search from τ = 2 so a
  // frequency above maxHz is found (and rejected) instead of being read as a sub-octave.
  let tau = 2
  while (tau < maxTau && cmnd[tau] >= threshold) tau++
  if (tau >= maxTau) return UNVOICED
  while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) tau++

  // Parabolic interpolation for a sub-sample lag.
  const a = cmnd[tau - 1]
  const b = cmnd[tau]
  const c = cmnd[tau + 1]
  const denom = a - 2 * b + c
  const shift = denom > 0 ? (0.5 * (a - c)) / denom : 0
  const f0 = sampleRate / (tau + shift)
  if (f0 < minHz || f0 > maxHz) return UNVOICED
  return { f0, clarity: Math.min(1, Math.max(0, 1 - b)) }
}

/** Pitch for each frame of `signal`. Frame count is `floor((length - frameSize) / hop) + 1`. */
export function pitchTrack(signal: Float32Array, sampleRate: number, frameSize: number, hop: number): PitchFrame[] {
  if (signal.length < frameSize) return []
  const count = Math.floor((signal.length - frameSize) / hop) + 1
  return Array.from({ length: count }, (_, i) =>
    detectPitch(signal.subarray(i * hop, i * hop + frameSize), sampleRate),
  )
}

/** Pitched when at least 20 % of frames are voiced; root is the median voiced f0. */
export function summarisePitch(track: PitchFrame[]): PitchSummary {
  const voiced = track.filter((p) => p.f0 > 0)
  if (voiced.length === 0) return { pitched: false, rootHz: 0, confidence: 0 }
  const sorted = voiced.map((p) => p.f0).sort((x, y) => x - y)
  const mid = sorted.length >> 1
  const rootHz = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const confidence = voiced.reduce((sum, p) => sum + p.clarity, 0) / track.length
  return { pitched: voiced.length / track.length >= MIN_VOICED_SHARE, rootHz, confidence }
}
