import { MODEL_VERSION, type SpectralModel } from '../src/audio/model'
import { SR } from './signals'

/** A hand-made frame: one [ratio, amp] pair per partial. */
export type Frame = [ratio: number, amp: number][]

/** Builds a harmonic-mode model. All frames must have the same partial count. */
export function makeModel(frames: Frame[], rootHz: number, hopSize = 441, sampleRate = SR): SpectralModel {
  const partialCount = frames[0]?.length ?? 0
  const amp = new Float32Array(frames.length * partialCount)
  const ratio = new Float32Array(frames.length * partialCount)
  frames.forEach((f, i) =>
    f.forEach(([r, a], k) => {
      ratio[i * partialCount + k] = r
      amp[i * partialCount + k] = a
    }),
  )
  return {
    version: MODEL_VERSION,
    sampleRate,
    hopSize,
    frameCount: frames.length,
    mode: 'harmonic',
    rootHz,
    pitchConfidence: 1,
    partialCount,
    amp,
    ratio,
    f0Track: new Float32Array(frames.length).fill(rootHz),
  }
}

/** `frameCount` copies of the same frame. */
export function steady(partials: Frame, frameCount: number): Frame[] {
  return Array.from({ length: frameCount }, () => partials)
}
