import type { SpectralModel } from '../audio/model'

/** Window after the energy peak in which the sustain frame is chosen. */
export const SUSTAIN_WINDOW_SECONDS = 1
/** Frames quieter than this, relative to the peak, are not used as the sustain frame. */
export const SUSTAIN_FLOOR_DB = -12

/**
 * The frame a held note freezes on: the frame with the lowest spectral flux between the energy peak
 * and SUSTAIN_WINDOW_SECONDS after it, while the level stays within SUSTAIN_FLOOR_DB of the peak.
 */
export function findSustainFrame(model: SpectralModel): number {
  void model
  return -1 // stub
}
