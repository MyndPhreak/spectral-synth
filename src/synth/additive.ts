import { MODEL_VERSION, type SpectralModel } from '../audio/model'

const TWO_PI = 2 * Math.PI

/**
 * Renders the model as a bank of sine partials at `targetHz`.
 * Output length is `frameCount × hopSize`, peak ≤ 1. Partials at or above Nyquist are muted.
 * Throws RangeError on an unknown model version.
 */
export function renderAdditive(model: SpectralModel, targetHz: number): Float32Array {
  if (model.version !== MODEL_VERSION) throw new RangeError(`Unknown spectral model version ${model.version}`)

  const { frameCount, partialCount, hopSize, amp, ratio, sampleRate } = model
  const out = new Float32Array(frameCount * hopSize)
  const nyquist = sampleRate / 2
  const radPerHz = TWO_PI / sampleRate

  for (let k = 0; k < partialCount; k++) {
    let phase = 0
    for (let f = 0; f < frameCount; f++) {
      const i0 = f * partialCount + k
      const i1 = (f + 1 < frameCount ? f + 1 : f) * partialCount + k
      const a0 = amp[i0]
      const a1 = amp[i1]
      if (a0 === 0 && a1 === 0) continue
      // A silent end has ratio 0: hold the other end's ratio so a fade does not sweep from 0 Hz.
      const r0 = ratio[i0] || ratio[i1]
      const r1 = ratio[i1] || r0
      const base = f * hopSize
      for (let n = 0; n < hopSize; n++) {
        const t = n / hopSize
        const hz = (r0 + (r1 - r0) * t) * targetHz
        if (hz < nyquist) out[base + n] += (a0 + (a1 - a0) * t) * Math.sin(phase)
        phase += radPerHz * hz
      }
      phase %= TWO_PI
    }
  }

  let peak = 0
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  if (peak > 1) for (let i = 0; i < out.length; i++) out[i] /= peak
  return out
}
