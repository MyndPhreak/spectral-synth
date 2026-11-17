export const MODEL_VERSION = 1

export type AnalysisMode = 'harmonic' | 'peaks'

/**
 * The result of analysis and the input of every synth engine.
 * Partial frequencies are ratios to `rootHz`, so a synth plays any note as `ratio * targetHz`.
 * `amp` and `ratio` are `frameCount × partialCount`, row-major: index `frame * partialCount + k`.
 */
export interface SpectralModel {
  version: typeof MODEL_VERSION
  sampleRate: number
  /** Samples between frames. */
  hopSize: number
  frameCount: number
  mode: AnalysisMode
  /** Reference pitch in Hz: median f0 in harmonic mode, 261.63 (C4) in peaks mode. */
  rootHz: number
  /** 0..1, share of voiced frames weighted by YIN clarity. */
  pitchConfidence: number
  partialCount: number
  /** Linear amplitude per frame and partial. */
  amp: Float32Array
  /** Frequency / rootHz per frame and partial; 0 where the partial is silent. */
  ratio: Float32Array
  /** f0 in Hz per frame; 0 when unvoiced. */
  f0Track: Float32Array
}

/** Root pitch used when a sound has no stable pitch, so it plays at its recorded pitch on middle C. */
export const PEAKS_ROOT_HZ = 261.63

export type AnalysisErrorCode = 'too-short' | 'too-long' | 'silent' | 'bad-input'

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode

  constructor(code: AnalysisErrorCode, message: string) {
    super(message)
    this.name = 'AnalysisError'
    this.code = code
  }
}

/** Placeholder body for contract stubs. Takes the stub's arguments so unused-parameter checks pass. */
export function notImplemented(..._args: unknown[]): never {
  throw new Error('not implemented')
}
