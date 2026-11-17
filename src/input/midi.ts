export type MidiNoteEvent = { type: 'noteOn' | 'noteOff'; note: number; velocity: number }

export type MidiStatus = 'connected' | 'no-devices' | 'unsupported' | 'denied'

/** Note-on and note-off on any channel; a note-on with velocity 0 is a note-off. Anything else -> null. */
export function parseMidiMessage(data: Uint8Array): MidiNoteEvent | null {
  if (data.length < 3) return null
  const command = data[0] & 0xf0
  const note = data[1]
  const velocity = data[2]
  if (command === NOTE_ON && velocity > 0) return { type: 'noteOn', note, velocity }
  if (command === NOTE_ON || command === NOTE_OFF) return { type: 'noteOff', note, velocity }
  return null
}

const NOTE_OFF = 0x80
const NOTE_ON = 0x90

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
