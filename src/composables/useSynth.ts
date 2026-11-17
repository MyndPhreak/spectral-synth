import { ref, shallowRef, watch, type Ref } from 'vue'
import { getAudioContext, resumeAudio } from '../audio/context'
import type { SpectralModel } from '../audio/model'
import { hzToNote } from '../audio/notes'
import { clampOctave, DEFAULT_OCTAVE, keyToNote } from '../input/keyboard'
import { connectMidi, type MidiStatus } from '../input/midi'
import { createEngine, type SynthEngine } from '../synth/engine'
import { DEFAULT_VOICE_SETTINGS } from '../synth/voices'
import { useAnalysis } from './useAnalysis'

export const KEYBOARD_VELOCITY = 100
const OCTAVE_DOWN_KEY = 'KeyZ'
const OCTAVE_UP_KEY = 'KeyX'

export interface UseSynth {
  /** Engine created and a model loaded. */
  ready: Ref<boolean>
  heldNotes: Ref<ReadonlySet<number>>
  octave: Ref<number>
  /** 0.05..5 s, sent to the engine on change. */
  releaseSeconds: Ref<number>
  midiStatus: Ref<MidiStatus | null>
  /** True while the browser keeps the AudioContext suspended (no user gesture yet). */
  audioSuspended: Ref<boolean>
  /** Velocity defaults to 100. */
  noteOn(note: number, velocity?: number): void
  noteOff(note: number): void
  shiftOctave(delta: -1 | 1): void
  /** Adds keyboard, focus and MIDI listeners. Returns a function that removes them. */
  attachInputs(): () => void
}

const ready = ref(false)
const heldNotes = shallowRef<ReadonlySet<number>>(new Set())
const octave = ref(DEFAULT_OCTAVE)
const releaseSeconds = ref(DEFAULT_VOICE_SETTINGS.releaseSeconds)
const midiStatus = ref<MidiStatus | null>(null)
const audioSuspended = ref(false)

let engine: SynthEngine | null = null
let enginePromise: Promise<SynthEngine> | null = null

function getEngine(): Promise<SynthEngine> {
  if (!enginePromise) {
    const ctx = getAudioContext()
    audioSuspended.value = ctx.state !== 'running'
    ctx.addEventListener('statechange', () => (audioSuspended.value = ctx.state !== 'running'))
    enginePromise = createEngine(ctx).then((e) => {
      e.setRelease(releaseSeconds.value)
      return (engine = e)
    })
  }
  return enginePromise
}

function setHeld(update: (s: Set<number>) => void) {
  const next = new Set(heldNotes.value)
  update(next)
  heldNotes.value = next
}

function noteOn(note: number, velocity = KEYBOARD_VELOCITY): void {
  if (!ready.value || !engine) return
  // Key and pointer presses are user gestures, so the browser lets the context start here.
  resumeAudio().catch((e) => console.error('useSynth.noteOn: resumeAudio failed', e))
  setHeld((s) => s.add(note))
  engine.noteOn(note, velocity)
}

function noteOff(note: number): void {
  setHeld((s) => s.delete(note))
  engine?.noteOff(note)
}

function allNotesOff(): void {
  heldNotes.value = new Set()
  engine?.allNotesOff()
}

function shiftOctave(delta: -1 | 1): void {
  octave.value = clampOctave(octave.value + delta)
}

async function loadModel(model: SpectralModel | null): Promise<void> {
  allNotesOff()
  ready.value = false
  if (!model) return
  try {
    const e = await getEngine()
    // A newer model may have arrived while the engine was created.
    if (useAnalysis().model.value !== model) return
    e.load(model)
    // Start in the octave that holds the original pitch, so the A..; keys reach it.
    octave.value = clampOctave(Math.floor(hzToNote(model.rootHz) / 12) - 1)
    ready.value = true
  } catch (err) {
    console.error('useSynth.loadModel: engine setup failed', err)
  }
}

watch(useAnalysis().model, loadModel, { immediate: true })
watch(releaseSeconds, (s) => engine?.setRelease(s))

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function attachInputs(): () => void {
  // The note each physical key started, so a key-up after an octave change releases the right note.
  const keyNotes = new Map<string, number>()

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
    if (e.code === OCTAVE_DOWN_KEY || e.code === OCTAVE_UP_KEY) {
      shiftOctave(e.code === OCTAVE_DOWN_KEY ? -1 : 1)
      e.preventDefault()
      return
    }
    const note = keyToNote(e.code, octave.value)
    if (note === null) return
    e.preventDefault()
    keyNotes.set(e.code, note)
    noteOn(note)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    const note = keyNotes.get(e.code)
    if (note === undefined) return
    keyNotes.delete(e.code)
    noteOff(note)
  }
  const releaseAll = () => {
    keyNotes.clear()
    allNotesOff()
  }
  const onVisibility = () => document.hidden && releaseAll()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseAll)
  document.addEventListener('visibilitychange', onVisibility)

  // Ask for MIDI only once a sound is ready to play, not on page load (Chrome shows a permission prompt).
  let disconnectMidi: (() => void) | null = null
  let midiRequested = false
  let detached = false
  const stopWatch = watch(
    ready,
    (isReady) => {
      if (!isReady || midiRequested) return
      midiRequested = true
      connectMidi(
        (e) => (e.type === 'noteOn' ? noteOn(e.note, e.velocity) : noteOff(e.note)),
        (s) => (midiStatus.value = s),
      ).then((stop) => (detached ? stop() : (disconnectMidi = stop)))
    },
    { immediate: true },
  )

  return () => {
    detached = true
    stopWatch()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', releaseAll)
    document.removeEventListener('visibilitychange', onVisibility)
    disconnectMidi?.()
    releaseAll()
  }
}

export function useSynth(): UseSynth {
  return { ready, heldNotes, octave, releaseSeconds, midiStatus, audioSuspended, noteOn, noteOff, shiftOctave, attachInputs }
}
