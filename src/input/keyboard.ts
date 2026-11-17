export const DEFAULT_OCTAVE = 4
export const MIN_OCTAVE = 0
export const MAX_OCTAVE = 8

/**
 * Piano layout on the physical keys (KeyboardEvent.code), as semitones above C of the current octave:
 * the A S D F … row is white keys, the W E T Y U O P row is black keys.
 */
export const KEY_SEMITONES: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
}

/** MIDI note for a physical key at `octave` (C4 = 60), or null when the key is not mapped or out of range. */
export function keyToNote(code: string, octave: number): number | null {
  void [code, octave]
  return -1 // stub
}

export function clampOctave(octave: number): number {
  void octave
  return NaN // stub
}
