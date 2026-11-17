import { AnalysisError, MODEL_VERSION, PEAKS_ROOT_HZ, type SpectralModel } from './model'
import { findPeaks, type Peak } from './peaks'
import { assignHarmonics, trackPeaks } from './partials'
import { pitchTrack, summarisePitch } from './pitch'

export interface AnalyseOptions {
  frameSize: number
  maxSeconds: number
  maxPartials: number
}

export const DEFAULT_ANALYSE_OPTIONS: AnalyseOptions = { frameSize: 2048, maxSeconds: 30, maxPartials: 64 }

/** Seconds between analysis frames. */
const HOP_SECONDS = 0.01
/** Peak level at or below this (−100 dBFS) counts as silence. */
const SILENCE_PEAK = 1e-5

function validate(signal: Float32Array, sampleRate: number, opts: AnalyseOptions): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new AnalysisError('bad-input', `Invalid sample rate: ${sampleRate}`)
  }
  let peak = 0
  for (const v of signal) {
    if (!Number.isFinite(v)) throw new AnalysisError('bad-input', 'Signal contains NaN or infinite samples')
    peak = Math.max(peak, Math.abs(v))
  }
  if (signal.length < opts.frameSize) {
    throw new AnalysisError('too-short', `Signal has ${signal.length} samples; at least ${opts.frameSize} needed`)
  }
  if (signal.length / sampleRate > opts.maxSeconds) {
    throw new AnalysisError('too-long', `Signal is longer than ${opts.maxSeconds} s`)
  }
  if (peak <= SILENCE_PEAK) throw new AnalysisError('silent', 'Signal is silent')
}

/** Builds a spectral model from a mono signal. Throws AnalysisError on bad, silent, short or long input. */
export function analyse(signal: Float32Array, sampleRate: number, opts?: Partial<AnalyseOptions>): SpectralModel {
  const options = { ...DEFAULT_ANALYSE_OPTIONS, ...opts }
  validate(signal, sampleRate, options)
  const { frameSize, maxPartials } = options
  const hopSize = Math.round(HOP_SECONDS * sampleRate)

  // Pad half a frame on both sides so frame f is centred on input sample f · hopSize,
  // which is where the renderer places it.
  const half = frameSize / 2
  const padded = new Float32Array(signal.length + frameSize)
  padded.set(signal, half)

  const track = pitchTrack(padded, sampleRate, frameSize, hopSize)
  const frameCount = track.length
  const summary = summarisePitch(track)
  const framePeaks: Peak[][] = Array.from({ length: frameCount }, (_, f) =>
    findPeaks(padded.subarray(f * hopSize, f * hopSize + frameSize), sampleRate, { maxPeaks: maxPartials * 2 }),
  )
  const f0Track = Float32Array.from(track, (p) => p.f0)
  const base: Omit<SpectralModel, 'mode' | 'rootHz' | 'partialCount' | 'amp' | 'ratio'> = {
    version: MODEL_VERSION,
    sampleRate, hopSize, frameCount, pitchConfidence: summary.confidence, f0Track }

  const harmonic = summary.pitched ? harmonicPartials(framePeaks, track.map((p) => p.f0), summary.rootHz, sampleRate, maxPartials) : null
  if (harmonic && harmonic.energyShare >= MIN_HARMONIC_SHARE) {
    const { partialCount, amp, ratio } = harmonic
    return { ...base, mode: 'harmonic', rootHz: summary.rootHz, partialCount, amp, ratio }
  }
  const tracked = trackPeaks(framePeaks, PEAKS_ROOT_HZ, maxPartials)
  return { ...base, mode: 'peaks', rootHz: PEAKS_ROOT_HZ, ...tracked }
}

/**
 * Harmonic mode is kept only when the harmonics explain this share of the peak energy. YIN can report a
 * confident "pitch" for inharmonic tones that share a near-common period (300 Hz + 300·π Hz reads as
 * 313 Hz); harmonic assignment would then drop the tones that miss, so peak tracking is used instead.
 */
const MIN_HARMONIC_SHARE = 0.8

function harmonicPartials(framePeaks: Peak[][], f0s: number[], rootHz: number, sampleRate: number, maxPartials: number) {
  const frameCount = framePeaks.length
  const partialCount = Math.min(maxPartials, Math.floor(sampleRate / 2 / rootHz))
  const amp = new Float32Array(frameCount * partialCount)
  const ratio = new Float32Array(frameCount * partialCount)
  let captured = 0
  let total = 0
  framePeaks.forEach((peaks, f) => {
    // Unvoiced frames inside a pitched sound (attack, tail) use the root, so partials stay continuous.
    const f0 = f0s[f] > 0 ? f0s[f] : rootHz
    const h = assignHarmonics(peaks, f0, rootHz, partialCount)
    amp.set(h.amp, f * partialCount)
    ratio.set(h.ratio, f * partialCount)
    for (const a of h.amp) captured += a * a
    for (const p of peaks) total += p.amp * p.amp
  })
  return { partialCount, amp, ratio, energyShare: total > 0 ? captured / total : 0 }
}
