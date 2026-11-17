export type MidiNoteEvent = { type: 'noteOn' | 'noteOff'; note: number; velocity: number }

export type MidiStatus = 'connected' | 'no-devices' | 'unsupported' | 'denied'

/** Note-on and note-off on any channel; a note-on with velocity 0 is a note-off. Anything else -> null. */
export function parseMidiMessage(data: Uint8Array): MidiNoteEvent | null {
  void data
  return { type: 'noteOn', note: -1, velocity: -1 } // stub
}

/**
 * Listens to note messages from every MIDI input, and re-binds when devices are added or removed.
 * Returns a function that stops listening.
 */
export async function connectMidi(
  onEvent: (e: MidiNoteEvent) => void,
  onStatus: (s: MidiStatus) => void,
): Promise<() => void> {
  void onEvent
  onStatus('unsupported') // stub
  return () => {}
}
