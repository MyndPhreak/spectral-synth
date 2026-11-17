import { notImplemented, type SpectralModel } from './model'

export interface AnalyseOptions {
  frameSize: number
  maxSeconds: number
  maxPartials: number
}

export const DEFAULT_ANALYSE_OPTIONS: AnalyseOptions = { frameSize: 2048, maxSeconds: 30, maxPartials: 64 }

/** Builds a spectral model from a mono signal. Throws AnalysisError on bad, silent, short or long input. */
export function analyse(signal: Float32Array, sampleRate: number, opts?: Partial<AnalyseOptions>): SpectralModel {
  return notImplemented(signal, sampleRate, opts)
}
