import { MODEL_VERSION, type SpectralModel } from './model'

export interface AnalyseOptions {
  frameSize: number
  maxSeconds: number
  maxPartials: number
}

export const DEFAULT_ANALYSE_OPTIONS: AnalyseOptions = { frameSize: 2048, maxSeconds: 30, maxPartials: 64 }

/** Builds a spectral model from a mono signal. Throws AnalysisError on bad, silent, short or long input. */
export function analyse(signal: Float32Array, sampleRate: number, opts?: Partial<AnalyseOptions>): SpectralModel {
  void [signal, sampleRate, opts]
  // Stub: an empty model with NaN fields.
  return {
    version: MODEL_VERSION,
    sampleRate: NaN,
    hopSize: 0,
    frameCount: 0,
    mode: 'peaks',
    rootHz: NaN,
    pitchConfidence: NaN,
    partialCount: 0,
    amp: new Float32Array(0),
    ratio: new Float32Array(0),
    f0Track: new Float32Array(0),
  }
}
