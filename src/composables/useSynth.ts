import { ref, shallowRef, type Ref } from 'vue'
import { DEFAULT_OCTAVE } from '../input/keyboard'
import type { MidiStatus } from '../input/midi'
import { DEFAULT_VOICE_SETTINGS } from '../synth/voices'

export interface UseSynth {
  /** Engine created and a model loaded. */
  ready: Ref<boolean>
  heldNotes: Ref<ReadonlySet<number>>
  octave: Ref<number>
  /** 0.05..5 s, sent to the engine on change. */
  releaseSeconds: Ref<number>
  midiStatus: Ref<MidiStatus | null>
  /** Velocity defaults to 100. */
  noteOn(note: number, velocity?: number): void
  noteOff(note: number): void
  shiftOctave(delta: -1 | 1): void
}

const ready = ref(false)
const heldNotes = shallowRef<ReadonlySet<number>>(new Set())
const octave = ref(DEFAULT_OCTAVE)
const releaseSeconds = ref(DEFAULT_VOICE_SETTINGS.releaseSeconds)
const midiStatus = ref<MidiStatus | null>(null)

export function useSynth(): UseSynth {
  // Stub: wired to the engine, keyboard and MIDI in unit 4.
  return {
    ready,
    heldNotes,
    octave,
    releaseSeconds,
    midiStatus,
    noteOn: (note, velocity) => void [note, velocity],
    noteOff: (note) => void note,
    shiftOctave: (delta) => void delta,
  }
}
