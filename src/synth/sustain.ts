import type { SpectralModel } from '../audio/model'

/** Window after the energy peak in which the sustain frame is chosen. */
export const SUSTAIN_WINDOW_SECONDS = 1
/** Frames quieter than this, relative to the peak, are not used as the sustain frame. */
export const SUSTAIN_FLOOR_DB = -12

/**
 * The frame a held note freezes on: the frame with the lowest spectral flux between the energy peak
 * and SUSTAIN_WINDOW_SECONDS after it, while the level stays within SUSTAIN_FLOOR_DB of the peak.
 * Flux is relative to the frame's energy, so a steady decay does not favour its quieter frames.
 */
export function findSustainFrame(model: SpectralModel): number {
  const { frameCount, partialCount, amp, ratio, sampleRate, hopSize } = model
  if (frameCount <= 1 || partialCount === 0) return 0

  const energy = new Float64Array(frameCount)
  let peak = 0
  for (let f = 0; f < frameCount; f++) {
    for (let k = 0; k < partialCount; k++) energy[f] += amp[f * partialCount + k] ** 2
    if (energy[f] > energy[peak]) peak = f
  }
  if (energy[peak] === 0) return 0

  // Change from frame f−1 to f, in amplitude and in frequency (weighted by the partial's level).
  const change = (f: number): number => {
    if (f <= 0 || f >= frameCount) return 0
    let sum = 0
    for (let k = 0; k < partialCount; k++) {
      const a0 = amp[(f - 1) * partialCount + k]
      const a1 = amp[f * partialCount + k]
      const dr = ratio[f * partialCount + k] - ratio[(f - 1) * partialCount + k]
      sum += (a1 - a0) ** 2 + (Math.min(a0, a1) * dr) ** 2
    }
    return sum
  }

  const floor = energy[peak] * 10 ** (SUSTAIN_FLOOR_DB / 10)
  const last = Math.min(frameCount - 1, peak + Math.floor((SUSTAIN_WINDOW_SECONDS * sampleRate) / hopSize))
  let best = peak
  let bestFlux = Infinity
  for (let f = peak; f <= last && energy[f] >= floor; f++) {
    const flux = (change(f) + change(f + 1)) / energy[f]
    if (flux < bestFlux) [best, bestFlux] = [f, flux]
  }
  return best
}
