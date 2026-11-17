import { fft, hann } from './fft'

export interface Peak {
  hz: number
  /** Linear amplitude, corrected for the window gain. */
  amp: number
}

export interface PeakOptions {
  maxPeaks: number
  /** Peaks quieter than this, relative to the strongest, are dropped. */
  floorDb: number
}

export const DEFAULT_PEAK_OPTIONS: PeakOptions = { maxPeaks: 64, floorDb: -80 }

/** Magnitudes below this are treated as silence (avoids log(0)). */
const SILENT_MAG = 1e-12
/** A Hann main lobe spans ±2 bins; a peak must beat both neighbours on each side. */
const LOBE = 2

/** Hann window magnitude response at `x` bins from the centre, normalised to 1 at 0: sinc(x) / (1 − x²). */
function hannResponse(x: number): number {
  if (Math.abs(x) < 1e-9) return 1
  return Math.abs(Math.sin(Math.PI * x) / (Math.PI * x) / (1 - x * x))
}

const windows = new Map<number, Float64Array>()

function windowFor(size: number): Float64Array {
  let w = windows.get(size)
  if (!w) windows.set(size, (w = hann(size)))
  return w
}

/** Spectral peaks of one frame (Hann window, parabolic interpolation), sorted by amp, strongest first. */
export function findPeaks(frame: Float32Array, sampleRate: number, opts?: Partial<PeakOptions>): Peak[] {
  const { maxPeaks, floorDb } = { ...DEFAULT_PEAK_OPTIONS, ...opts }
  const n = frame.length
  const w = windowFor(n)
  const re = Float64Array.from(frame, (x, i) => x * w[i])
  const im = new Float64Array(n)
  fft(re, im)

  const bins = n / 2
  const mag = new Float64Array(bins)
  for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k], im[k])

  // Window coherent gain is 0.5 and a real sine splits its energy over ±f: amp = 2·|X| / (0.5·n).
  const toAmp = 4 / n
  const peaks: Peak[] = []
  for (let k = LOBE; k < bins - LOBE; k++) {
    const m = mag[k]
    if (m < SILENT_MAG) continue
    let isPeak = true
    for (let j = 1; j <= LOBE && isPeak; j++) isPeak = m > mag[k - j] && m >= mag[k + j]
    if (!isPeak) continue
    // Parabolic interpolation on log magnitude for the sub-bin offset p.
    const a = Math.log(Math.max(mag[k - 1], SILENT_MAG))
    const b = Math.log(m)
    const c = Math.log(Math.max(mag[k + 1], SILENT_MAG))
    const denom = a - 2 * b + c
    const p = denom < 0 ? (0.5 * (a - c)) / denom : 0
    // Amplitude from the bin divided by the Hann main-lobe response at offset p (scalloping correction).
    peaks.push({ hz: ((k + p) * sampleRate) / n, amp: (m / hannResponse(p)) * toAmp })
  }

  peaks.sort((x, y) => y.amp - x.amp)
  if (peaks.length === 0) return peaks
  const floor = peaks[0].amp * 10 ** (floorDb / 20)
  return peaks.filter((pk) => pk.amp >= floor).slice(0, maxPeaks)
}
