const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** Name and octave of a MIDI note, e.g. 57 -> "A3". */
export function noteName(note: number): string {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`
}

/** Nearest MIDI note to a frequency. */
export function hzToNote(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440))
}
