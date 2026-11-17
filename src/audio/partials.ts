import type { Peak } from './peaks'

export interface FramePartials {
  amp: Float32Array
  ratio: Float32Array
}

export interface TrackedPartials extends FramePartials {
  partialCount: number
}

/** Default relative frequency tolerance when matching a peak to a harmonic or a tracked partial. */
export const PARTIAL_TOLERANCE = 0.03

/**
 * Assigns one frame's peaks to harmonics 1..partialCount of `f0`. A peak matches harmonic k when it is
 * within `tolerance · k · f0` (and half a harmonic spacing) of `k · f0`; the strongest match wins.
 * Unmatched harmonics get amp 0, ratio 0.
 */
export function assignHarmonics(
  peaks: Peak[],
  f0: number,
  rootHz: number,
  partialCount: number,
  tolerance: number = PARTIAL_TOLERANCE,
): FramePartials {
  const amp = new Float32Array(partialCount)
  const ratio = new Float32Array(partialCount)
  if (!(f0 > 0)) return { amp, ratio }
  for (const peak of peaks) {
    const k = Math.round(peak.hz / f0)
    if (k < 1 || k > partialCount) continue
    const offset = Math.abs(peak.hz - k * f0)
    if (offset > tolerance * k * f0 || offset > f0 / 2) continue
    if (peak.amp > amp[k - 1]) {
      amp[k - 1] = peak.amp
      ratio[k - 1] = peak.hz / rootHz
    }
  }
  return { amp, ratio }
}

/**
 * Greedy nearest-frequency tracking of peaks across frames. Each frame, peaks (strongest first) join the
 * free slot whose last frequency is closest within PARTIAL_TOLERANCE, or open a new slot while fewer than
 * `maxPartials` exist; otherwise they are dropped. Output is `frames × partialCount`, row-major.
 */
export function trackPeaks(framesPeaks: Peak[][], rootHz: number, maxPartials: number): TrackedPartials {
  const slotHz: number[] = []
  const assigned: Map<number, Peak>[] = []

  for (const peaks of framesPeaks) {
    const frame = new Map<number, Peak>()
    for (const peak of [...peaks].sort((a, b) => b.amp - a.amp)) {
      let best = -1
      let bestDist = Infinity
      slotHz.forEach((hz, s) => {
        const dist = Math.abs(peak.hz - hz)
        if (!frame.has(s) && dist <= PARTIAL_TOLERANCE * hz && dist < bestDist) [best, bestDist] = [s, dist]
      })
      if (best < 0 && slotHz.length < maxPartials) best = slotHz.push(peak.hz) - 1
      if (best < 0) continue
      slotHz[best] = peak.hz
      frame.set(best, peak)
    }
    assigned.push(frame)
  }

  const partialCount = slotHz.length
  const amp = new Float32Array(framesPeaks.length * partialCount)
  const ratio = new Float32Array(framesPeaks.length * partialCount)
  assigned.forEach((frame, f) =>
    frame.forEach((peak, s) => {
      amp[f * partialCount + s] = peak.amp
      ratio[f * partialCount + s] = peak.hz / rootHz
    }),
  )
  return { amp, ratio, partialCount }
}
