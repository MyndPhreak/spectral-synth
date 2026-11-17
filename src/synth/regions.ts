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

/** First and last frames whose energy is within TRIM_FLOOR_DB of the peak; endFrame is exclusive. */
export function findTrim(model: SpectralModel): { startFrame: number; endFrame: number } {
  return { startFrame: 0, endFrame: model.frameCount } // stub
}

/** Automatic markers: trimmed start and end, loop at the sustain frame. */
export function defaultRegions(model: SpectralModel): PlayRegions {
  // Stub: one-frame loop at the sustain frame, the Phase 3 freeze.
  const s = findSustainFrame(model)
  return { startFrame: 0, loopStart: s, loopEnd: s + 1, endFrame: model.frameCount }
}

/** Moves one marker to `frame`, clamped between its neighbours. */
export function moveMarker(regions: PlayRegions, marker: MarkerName, frame: number, frameCount: number): PlayRegions {
  void [marker, frame, frameCount]
  return regions // stub
}

/** Throws RangeError when the order rule is broken. */
export function assertRegions(regions: PlayRegions, frameCount: number): void {
  void [regions, frameCount] // stub
}
