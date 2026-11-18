import type { SpectralModel } from '../audio/model'
import { findSustainFrame } from './sustain'

/** Frame indices into a SpectralModel. 0 ≤ startFrame ≤ loopStart < loopEnd ≤ endFrame ≤ frameCount. */
export interface PlayRegions {
  startFrame: number
  loopStart: number
  loopEnd: number
  endFrame: number
}

export type MarkerName = keyof PlayRegions

/** Order of the markers along the timeline. */
export const MARKER_ORDER: readonly MarkerName[] = ['startFrame', 'loopStart', 'loopEnd', 'endFrame']

/** Frames quieter than this, relative to the peak, are trimmed from the start and end. */
export const TRIM_FLOOR_DB = -50
/** Default loop length after the sustain frame (~0.2 s at a 10 ms hop). */
export const DEFAULT_LOOP_FRAMES = 20

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** First and last frames whose energy is within TRIM_FLOOR_DB of the peak; endFrame is exclusive. */
export function findTrim(model: SpectralModel): { startFrame: number; endFrame: number } {
  const { frameCount, partialCount, amp } = model
  const energy = new Float64Array(frameCount)
  let peak = 0
  for (let f = 0; f < frameCount; f++) {
    for (let k = 0; k < partialCount; k++) energy[f] += amp[f * partialCount + k] ** 2
    peak = Math.max(peak, energy[f])
  }
  if (peak === 0) return { startFrame: 0, endFrame: frameCount }
  const floor = peak * 10 ** (TRIM_FLOOR_DB / 10)
  let startFrame = 0
  while (energy[startFrame] < floor) startFrame++
  let last = frameCount - 1
  while (energy[last] < floor) last--
  return { startFrame, endFrame: last + 1 }
}

/** Automatic markers: trimmed start and end, a DEFAULT_LOOP_FRAMES loop from the sustain frame. */
export function defaultRegions(model: SpectralModel): PlayRegions {
  const { startFrame, endFrame } = findTrim(model)
  const loopStart = clamp(findSustainFrame(model), startFrame, endFrame - 1)
  return { startFrame, loopStart, loopEnd: Math.min(endFrame, loopStart + DEFAULT_LOOP_FRAMES), endFrame }
}

/** Moves one marker to `frame` (rounded), clamped between its neighbours. The loop never becomes empty. */
export function moveMarker(regions: PlayRegions, marker: MarkerName, frame: number, frameCount: number): PlayRegions {
  const { startFrame, loopStart, loopEnd, endFrame } = regions
  const limits: Record<MarkerName, [number, number]> = {
    startFrame: [0, loopStart],
    loopStart: [startFrame, loopEnd - 1],
    loopEnd: [loopStart + 1, endFrame],
    endFrame: [loopEnd, frameCount],
  }
  const [lo, hi] = limits[marker]
  return { ...regions, [marker]: clamp(Math.round(frame), lo, hi) }
}

/** Throws RangeError when the order rule is broken. */
export function assertRegions(regions: PlayRegions, frameCount: number): void {
  const { startFrame, loopStart, loopEnd, endFrame } = regions
  const whole = [startFrame, loopStart, loopEnd, endFrame].every(Number.isInteger)
  if (!whole || startFrame < 0 || loopStart < startFrame || loopEnd <= loopStart || endFrame < loopEnd || endFrame > frameCount) {
    throw new RangeError(`Invalid play regions ${JSON.stringify(regions)} for ${frameCount} frames`)
  }
}
