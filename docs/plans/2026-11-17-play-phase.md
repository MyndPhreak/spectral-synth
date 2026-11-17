# Plan: Phase 3 · Play

Status: draft for review · 2026-11-17 · branch `feat/play-phase` (from `main` after PR #1)

## Summary

Phase 2 turns a sound into a `SpectralModel` and renders it offline at one pitch. Phase 3 makes the model **playable in real time**: an AudioWorklet runs a bank of up to 8 additive voices, each playing the model at the pitch of a held note. Notes come from the **computer keyboard** (a piano row, Z/X for octave), **Web MIDI** controllers, and an **on-screen piano**. Each note plays the sound's attack, **freezes on a sustain frame** while the key is held, and on release plays the rest of the sound under a release fade.

Decisions from the user (2026-11-17): sustain-point behaviour for held notes; computer keyboard and MIDI input.

## Architectural decisions

| Decision | Reason |
|---|---|
| **AudioWorklet voice bank**, not per-note offline renders | Rendering a 3 s sound takes ~200 ms per note (Phase 2 timing): too much latency. `playbackRate` on one buffer is instant but changes duration and formants, which loses the point of a spectral model. A worklet runs oscillators on the audio thread with one 128-sample block of latency. |
| **All DSP in a pure `VoiceBank` class** (`src/synth/voices.ts`); the worklet processor is thin glue | `VoiceBank.process(out)` runs in Node under Vitest. The processor only forwards messages and calls `process`. Same split as Phase 2 (pure DSP, Web Audio at the edge). |
| **Worklet bundled with Vite `?worker&url`** | Lets the processor import `voices.ts` and stay TypeScript. `vite/client.d.ts` declares `*?worker&url` (line 219). Unit 0 proves it loads in the browser; fallback is a plain JS processor in `public/`. |
| **Sine lookup table** (4096 points, linear interpolation) in the voice bank | 8 voices × 64 partials × 48 kHz ≈ 24 M sines/s. `Math.sin` at that rate risks dropouts on the audio thread; a table read is a few times cheaper. The error is below 1e-6 for a 4096-point table. |
| **Note frequency = 440 · 2^((n − 69)/12); partial = ratio · note frequency** | Reuses the model contract unchanged. The note nearest `rootHz` plays the sound at its own pitch (A3 for a 220 Hz sample, C4 for peaks mode). |
| **Voice timeline: frames advance at `hopSize` samples per frame, freeze at `sustainFrame` while held, continue to the end after release** | Matches the user's choice. A pluck keeps its natural decay after release; a held note never runs out. |
| **`findSustainFrame`: in the window from the energy peak to 1 s after it, while the level is within −12 dB of the peak, pick the frame with the lowest spectral flux** | The steadiest frame near the start freezes with the least audible "stuck" sound. Falls back to the peak frame. Pure function, tested on synthetic models. |
| **Envelope: 5 ms linear attack; release is an exponential fade to −60 dB over `releaseSeconds` (default 0.5 s), on top of the model's own decay** | The attack ramp removes the note-on click. Without a release fade, releasing a sustained sound (flute) would play its remaining seconds. One Release slider in the UI; the full ADSR set is Phase 4 controls. |
| **Polyphony 8; steal the oldest released voice, else the oldest held one, with a 5 ms fade before reuse** | A hard cut clicks. Released voices are the least audible to steal. |
| **Same note again while held → retrigger that voice, never a second voice** | Avoids phase-cancelling duplicates and stuck notes from MIDI devices that send double note-ons. |
| **Velocity gain = (velocity / 127)²**; computer keyboard and on-screen piano use velocity 100 | A square law is the usual perceptual approximation. No velocity curve UI in this phase. |
| **Keyboard mapping by `KeyboardEvent.code`** (physical key), base octave 4, Z/X change octave 0–8 | `code` is layout-independent, so AZERTY/QWERTZ users get the same piano shape. Ignore auto-repeat; release all notes on window blur (no stuck notes). Ignore keys while focus is in a form control. |
| **MIDI: `navigator.requestMIDIAccess()` without SysEx**, listen to all inputs and channels, re-bind on `statechange` | No permission prompt in Chrome without SysEx. Hot-plugged devices work. Note-on with velocity 0 is a note-off (MIDI spec). |
| **MIDI failure is explicit:** unsupported browser, denied permission, and no devices each show one STE100 line; the keyboard still works | Safari has no Web MIDI. Nothing fails silently. |
| **Master chain: worklet → GainNode (0.5) → DynamicsCompressorNode → destination** | Several loud voices can sum above 1. The platform compressor acts as a limiter with no new code. |
| **Engine loads a new model with `allNotesOff` first** | A note must never continue with partial data from a different sound. |

### Deviation from golden rules

- **No feature flag (rule 7)**, as in Phase 2: a new card in a demo with no users. The Capture and Analyse paths are unchanged.

## API contracts (landed as compiling stubs in unit 0)

```ts
// src/synth/voices.ts — pure DSP, runs inside the worklet, tested in Node
export interface VoiceSettings { attackSeconds: number; releaseSeconds: number; maxVoices: number }
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { attackSeconds: 0.005, releaseSeconds: 0.5, maxVoices: 8 }
export const STEAL_FADE_SECONDS = 0.005
export function noteToHz(note: number): number
export class VoiceBank {
  constructor(sampleRate: number, settings?: Partial<VoiceSettings>)
  /** Stops all voices at once. Throws RangeError on an unknown model version. */
  setModel(model: SpectralModel, sustainFrame: number): void
  setSettings(settings: Partial<VoiceSettings>): void
  noteOn(note: number, velocity: number): void   // note 0..127, velocity 1..127; no model -> ignored
  noteOff(note: number): void                    // unknown note -> no effect
  allNotesOff(): void                            // releases every voice (release fade applies)
  process(out: Float32Array): void               // overwrites out
  get voiceCount(): number                       // voices still sounding
}

// src/synth/sustain.ts
export function findSustainFrame(model: SpectralModel): number

// src/synth/messages.ts — main thread -> worklet
export type EngineMessage =
  | { type: 'model'; model: SpectralModel; sustainFrame: number }
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'allNotesOff' }
  | { type: 'settings'; settings: Partial<VoiceSettings> }

// src/synth/engine.ts — main thread
export interface SynthEngine {
  load(model: SpectralModel): void      // computes the sustain frame, sends allNotesOff + model
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  allNotesOff(): void
  setRelease(seconds: number): void
}
export function createEngine(ctx: AudioContext): Promise<SynthEngine>   // adds the worklet module once

// src/input/keyboard.ts
export const DEFAULT_OCTAVE = 4
export const MIN_OCTAVE = 0
export const MAX_OCTAVE = 8
export function keyToNote(code: string, octave: number): number | null
export function clampOctave(octave: number): number

// src/input/midi.ts
export type MidiNoteEvent = { type: 'noteOn' | 'noteOff'; note: number; velocity: number }
export function parseMidiMessage(data: Uint8Array): MidiNoteEvent | null
export type MidiStatus = 'connected' | 'no-devices' | 'unsupported' | 'denied'
export function connectMidi(onEvent: (e: MidiNoteEvent) => void, onStatus: (s: MidiStatus) => void): Promise<() => void>  // returns disconnect

// src/composables/useSynth.ts
export function useSynth(): {
  ready: Ref<boolean>               // engine created and a model loaded
  heldNotes: Ref<ReadonlySet<number>>
  octave: Ref<number>
  releaseSeconds: Ref<number>       // 0.05..5, sent to the engine on change
  midiStatus: Ref<MidiStatus | null>
  noteOn(note: number, velocity?: number): void   // velocity defaults to 100
  noteOff(note: number): void
  shiftOctave(delta: -1 | 1): void
}
```

Model and messages stay in memory; nothing is persisted. `setModel` reuses the Phase 2 version check.

## Files

| File | Change |
|---|---|
| `src/synth/voices.ts` | **New.** VoiceBank, sine table, envelopes, stealing |
| `src/synth/sustain.ts` | **New.** Sustain frame choice |
| `src/synth/messages.ts` | **New.** Worklet message types |
| `src/synth/worklet/processor.ts` | **New.** `AudioWorkletProcessor` glue around VoiceBank |
| `src/synth/engine.ts` | **New.** Worklet setup, master chain, message sending |
| `src/input/keyboard.ts` | **New.** Key-to-note mapping, octave clamp |
| `src/input/midi.ts` | **New.** MIDI message parsing, device connection |
| `src/composables/useSynth.ts` | **New.** Engine lifecycle, loads the model from `useAnalysis`, key/MIDI listeners, held notes |
| `src/components/PianoKeys.vue` | **New.** Two-octave on-screen piano, pointer input, held-note highlight |
| `src/components/PlayPanel.vue` | **New.** Piano, octave, Release slider, MIDI status, key hints |
| `src/App.vue` | Add the "3 · Play" card under Analyse |
| `tsconfig.app.json` | Add `AudioWorkletGlobalScope` types if `lib` lacks them (checked in unit 0) |
| `test/voices.test.ts`, `test/sustain.test.ts`, `test/keyboard.test.ts`, `test/midi.test.ts` | **New.** See Test plan |
| `test/models.ts` | **New.** Helpers to build small hand-made models (moved from `additive.test.ts`) |
| `README.md` | Phase 3 done, layout, key map |

## Test plan

```
voices.test.ts  (48 kHz, 128-sample blocks, single-partial models unless stated)
  - no notes -> output is all zeros
  - noteOn before any model -> output stays zero, no throw
  - model root 440, noteOn 69 -> strongest output 440 Hz ± 1 Hz
  - same model, noteOn 81 -> 880 Hz ± 1 Hz
  - root 220 model, noteOn 57 -> 220 Hz (note nearest the root plays the original pitch)
  - velocity 64 vs 127 -> steady-state level ratio (64/127)² within 1 %
  - first sample after noteOn is ~0, level reaches full after attackSeconds (no click)
  - timeline: model level 1.0 in frames 0..4, 0.5 from frame 5, sustainFrame 5, held for 3 × model length -> level stays 0.5 (frozen)
  - noteOff before the sustain frame -> plays on through later frames (level follows the model), does not freeze
  - after noteOff, level falls ≥ 60 dB within releaseSeconds, then voiceCount drops to 0
  - released note reaches the model end before the fade ends -> voice ends at the model end
  - noteOff for a note that is not playing -> no change
  - three notes held -> all three frequencies present in the output
  - same note twice while held -> voiceCount 1 (retrigger, no duplicate)
  - 9 notes with maxVoices 8 -> voiceCount 8 and the 9th note's frequency is present
  - stealing prefers a released voice over the oldest held one
  - stealing does not click: max sample-to-sample step stays < 0.05 for a 100 Hz full-scale partial
  - allNotesOff -> all voices release and end within releaseSeconds
  - setModel while notes sound -> output zero from the next block, voiceCount 0
  - setModel with version 2 -> RangeError
  - partial above Nyquist at a high note -> muted (no alias energy, as in additive.test.ts)
  - table sine matches Math.sin within 1e-5 over a 1 s single-partial render
  - setSettings releaseSeconds 2 -> the fade takes 2 s instead of 0.5 s

sustain.test.ts
  - flat tone after a 5-frame attack ramp -> sustain frame in the flat region
  - pluck (peak at frame 3, exponential decay) -> frame ≥ peak and level within −12 dB of the peak
  - unstable start (partials jumping) then steady -> frame in the steady region
  - silent frames before the sound -> frame is after the energy peak, not in the silence
  - window limited to 1 s after the peak even when the whole sound is steady
  - one-frame model -> 0

keyboard.test.ts
  - every mapped key at octave 4 -> its note (exhaustive table: KeyA 60 ... Semicolon 76)
  - octave 5 -> same keys +12
  - unmapped code (KeyQ, Space) -> null
  - note outside 0..127 (octave 8 high keys) -> null
  - clampOctave(-1) -> 0, clampOctave(9) -> 8, clampOctave(4) -> 4

midi.test.ts
  - [0x90, 60, 100] -> noteOn 60 velocity 100
  - [0x95, 60, 100] (channel 6) -> noteOn (all channels accepted)
  - [0x90, 60, 0] -> noteOff (velocity-0 note-on)
  - [0x80, 60, 64] -> noteOff
  - [0xB0, 64, 127] (sustain pedal CC) -> null
  - [0xF8] (clock) and a 2-byte note message -> null
```

**Not test-first, and why:** `worklet/processor.ts`, `engine.ts`, `connectMidi`, `useSynth.ts`, `PianoKeys.vue`, `PlayPanel.vue`, `App.vue`. They need `AudioWorklet`, Web MIDI or the DOM, which Node does not have. They are thin glue over tested functions. Covered by the manual steps below.

**Manual verification** (`npm run dev`, Chrome, then one check in Firefox and Safari):

1. Analyse a 220 Hz pluck. Press the key for A3: it plays at the original pitch. Play a three-note chord: three notes, no clicks.
2. Hold a key for 10 s on a 3 s sound: the note keeps a steady level. Release: it fades within the Release time.
3. Tap keys fast: short notes, no clicks, no stuck notes.
4. Press Z and X: the octave label changes and the same keys play an octave lower or higher.
5. Hold 10 notes (keys and mouse): at most 8 sound; the stolen note stops without a click.
6. Hold a key, then switch to another window: the note stops.
7. MIDI controller (if available): notes play with velocity; plug it in after the page loads and it works. Safari shows the unsupported-MIDI message and the keyboard still plays.
8. Analyse a new sound while a note is held: the note stops; new notes use the new sound.
9. 8 voices on a 64-partial sound: no dropouts (listen, and check the Chrome Performance panel for audio-thread overruns).
10. On-screen piano: click and drag across keys plays legato notes; held keys are highlighted in a distinct colour with a visible marker in light and dark mode; the card fits 375 px width without sideways scrolling.

## Out of scope

- Sustain pedal (CC64), pitch bend, mod wheel, aftertouch, MIDI channel selection, MIDI output.
- Attack/decay/sustain controls, velocity curve, presets, spectrum view (Phase 4).
- Loop regions, crossfaded sustain, time-stretch control.
- Noise residual, wavetable or other engines.
- Recording or exporting played audio.
- Analysis in a Web Worker.
- Multi-touch chords on the on-screen piano (single pointer only).
- Feature flag (see Deviation).

## Definition of done

- [ ] `npm test` passes; every test in the Test plan exists with the listed behaviour
- [ ] Each tested unit landed as a red commit (failing on an assertion) and then a green commit
- [ ] `npm run build` passes
- [ ] Notes play at `ratio × noteHz`; the note nearest the root plays the original pitch (`voices.test.ts`)
- [ ] Held notes freeze on the sustain frame; released notes continue and fade within the Release time (`voices.test.ts`, manual 2)
- [ ] 8-voice limit with click-free stealing (`voices.test.ts`, manual 5)
- [ ] Note-on clicks removed by the attack ramp (`voices.test.ts`, manual 3)
- [ ] Keyboard, MIDI and on-screen piano all play notes (manual 1, 4, 7, 10)
- [ ] MIDI unsupported / denied / no devices each show their message (`midi` manual 7)
- [ ] No stuck notes on blur or model change (manual 6, 8)
- [ ] No audio dropouts with 8 voices × 64 partials (manual 9)
- [ ] README Status, Layout and key map updated

## Acceptance criteria

1. Given an analysed sound, pressing a key, a MIDI note or an on-screen key plays the sound at that note's pitch with less than one audio block of added latency. → DoD 4, 8
2. Holding a note longer than the sound keeps it sounding; releasing it lets the sound decay with the release fade. → DoD 5
3. Up to 8 notes sound at once, and a 9th note replaces one without a click. → DoD 6, 7
4. The system never leaves a note sounding after its key is up, the window loses focus, or the sound changes. → DoD 10
5. Without MIDI support or permission, the system says so and the keyboard still works. → DoD 9

## Phases (commit units)

Each tested unit is two commits: `Add failing tests for <area>`, then `Implement <area>`.

| # | Unit | Depends on | Parallel? |
|---|---|---|---|
| 0 | Contract stubs for every signature above; worklet processor that outputs silence; prove `?worker&url` loads in Chrome; `test/models.ts` | – | – |
| 1 | `keyboard.ts` + `parseMidiMessage` | 0 | yes, with 2 and 3 |
| 2 | `findSustainFrame` | 0 | yes, with 1 and 3 |
| 3 | `VoiceBank` | 0 | yes, with 1 and 2 |
| 4 | Engine, worklet glue, `connectMidi`, `useSynth`, `PianoKeys`, `PlayPanel`, App, README | 1, 2, 3 | – (manual verification) |

Parallel builders need the approval-gate markers (`.claude/work/ACTIVE` and `<slug>/APPROVED`); without them, units 1–3 run one after another in this session.

## UI text (ASD-STE100)

| Where | Text |
|---|---|
| Card heading | 3 · Play |
| Before analysis | Analyse a sound to play it. |
| Key hint | Use the keys A to ; to play. Use Z and X to change the octave. |
| Octave | Octave: 4 |
| Release slider | Release: 0.50 s |
| MIDI connected | MIDI: connected. |
| MIDI no devices | MIDI: no device found. Connect a device to play with MIDI. |
| MIDI unsupported | This browser does not support MIDI. Use the computer keyboard. |
| MIDI denied | MIDI access was denied. Use the computer keyboard. |
| Audio suspended | Select the piano to start the sound. |
