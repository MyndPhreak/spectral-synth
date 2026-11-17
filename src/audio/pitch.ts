/** Pitch of one frame. `f0` is 0 when the frame is unvoiced. `clarity` is 0..1. */
export interface PitchFrame {
  f0: number
  clarity: number
}

export interface PitchOptions {
  minHz: number
  maxHz: number
  /** YIN absolute threshold on the normalised difference function. */
  threshold: number
}

export const DEFAULT_PITCH_OPTIONS: PitchOptions = { minHz: 40, maxHz: 2000, threshold: 0.15 }

export interface PitchSummary {
  pitched: boolean
  rootHz: number
  confidence: number
}

/** YIN pitch detection on one frame, with the difference function computed by FFT. */
export function detectPitch(frame: Float32Array, sampleRate: number, opts?: Partial<PitchOptions>): PitchFrame {
  void [frame, sampleRate, opts]
  return { f0: NaN, clarity: NaN } // stub
}

/** Pitch for each frame of `signal`. Frame count is `floor((length - frameSize) / hop) + 1`. */
export function pitchTrack(signal: Float32Array, sampleRate: number, frameSize: number, hop: number): PitchFrame[] {
  void [signal, sampleRate, frameSize, hop]
  return [{ f0: NaN, clarity: NaN }] // stub
}

/** Pitched when at least 20 % of frames are voiced; root is the median voiced f0. */
export function summarisePitch(track: PitchFrame[]): PitchSummary {
  void track
  return { pitched: true, rootHz: NaN, confidence: NaN } // stub
}
