export interface Peak {
  hz: number
  /** Linear amplitude, corrected for the window gain. */
  amp: number
}

export interface PeakOptions {
  maxPeaks: number
  /** Peaks quieter than this, relative to the strongest, are dropped. */
  floorDb: number
}

export const DEFAULT_PEAK_OPTIONS: PeakOptions = { maxPeaks: 64, floorDb: -80 }

/** Spectral peaks of one frame (Hann window, parabolic interpolation), sorted by amp, strongest first. */
export function findPeaks(frame: Float32Array, sampleRate: number, opts?: Partial<PeakOptions>): Peak[] {
  void [frame, sampleRate, opts]
  return [{ hz: NaN, amp: NaN }] // stub
}
