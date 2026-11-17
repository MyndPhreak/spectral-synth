import type { SpectralModel } from '../audio/model'

export interface VoiceSettings {
  attackSeconds: number
  releaseSeconds: number
  maxVoices: number
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { attackSeconds: 0.005, releaseSeconds: 0.5, maxVoices: 8 }

/** Fade applied to a voice before it is reused for a new note. */
export const STEAL_FADE_SECONDS = 0.005

/** Equal-tempered frequency of a MIDI note: 440 · 2^((note − 69) / 12). */
export function noteToHz(note: number): number {
  void note
  return NaN // stub
}

/**
 * Polyphonic additive voices that play a SpectralModel in real time. Pure DSP: runs inside the
 * AudioWorklet and under Vitest. Each voice plays frames at `hopSize` samples per frame, holds the
 * sustain frame while its note is down, and plays on to the end under a release fade after note-off.
 */
export class VoiceBank {
  constructor(sampleRate: number, settings?: Partial<VoiceSettings>) {
    void [sampleRate, settings]
  }

  /** Stops all voices at once. Throws RangeError on an unknown model version. */
  setModel(model: SpectralModel, sustainFrame: number): void {
    void [model, sustainFrame] // stub
  }

  setSettings(settings: Partial<VoiceSettings>): void {
    void settings // stub
  }

  /** note 0..127, velocity 1..127. Ignored when no model is set. */
  noteOn(note: number, velocity: number): void {
    void [note, velocity] // stub
  }

  /** Unknown note: no effect. */
  noteOff(note: number): void {
    void note // stub
  }

  /** Releases every voice; the release fade applies. */
  allNotesOff(): void {}

  /** Overwrites `out` with the next block of audio. */
  process(out: Float32Array): void {
    out.fill(0) // stub
  }

  /** Voices that are still sounding. */
  get voiceCount(): number {
    return -1 // stub
  }
}
