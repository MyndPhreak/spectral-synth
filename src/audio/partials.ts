import { notImplemented } from './model'
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

/** Assigns one frame's peaks to harmonics 1..partialCount of `f0`. Unmatched harmonics get amp 0, ratio 0. */
export function assignHarmonics(
  peaks: Peak[],
  f0: number,
  rootHz: number,
  partialCount: number,
  tolerance: number = PARTIAL_TOLERANCE,
): FramePartials {
  return notImplemented(peaks, f0, rootHz, partialCount, tolerance)
}

/** Greedy nearest-frequency tracking of peaks across frames. Output is `frames × partialCount`, row-major. */
export function trackPeaks(framesPeaks: Peak[][], rootHz: number, maxPartials: number): TrackedPartials {
  return notImplemented(framesPeaks, rootHz, maxPartials)
}
