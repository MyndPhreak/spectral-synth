import type { SpectralModel } from '../audio/model'

/**
 * Renders the model as a bank of sine partials at `targetHz`.
 * Output length is `frameCount × hopSize`, peak ≤ 1. Partials at or above Nyquist are muted.
 * Throws RangeError on an unknown model version.
 */
export function renderAdditive(model: SpectralModel, targetHz: number): Float32Array {
  // Stub: silent output of zero length.
  void model
  void targetHz
  return new Float32Array(0)
}
