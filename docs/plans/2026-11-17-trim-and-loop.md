# Plan: Trim and sustain loop

Status: draft for review · 2026-11-17 · branch `feat/play-regions`, stacked on `feat/play-phase` (PR #2, open)

## Summary

Phase 3 plays each note from the first analysis frame and freezes held notes on one automatically chosen frame. This change adds four **markers** on the sample waveform: **Start** and **End** clip silence (or anything else) from the playable sound, and **Loop start** and **Loop end** set a region that a held note **repeats** instead of freezing. On analysis the markers are placed automatically: Start and End at the first and last frames above −50 dB of the peak, the loop at the Phase 3 sustain frame. The user can drag them, also while a note sounds. The markers change playback only; the model is not re-analysed.

Decisions from the user (2026-11-17): loop a region (not a frozen point); automatic trim plus drag handles; markers on the sample waveform.

## Architectural decisions

| Decision | Reason |
|---|---|
| **Markers are frame indices applied at playback** (`PlayRegions`), the model stays unchanged | Dragging is instant with no re-analysis, and the markers can move while a note sounds. Analysis cost (~1 s per 10 s) would make drag-to-listen impossible. |
| **Spectral loop: when a held voice reaches Loop end, its position wraps to Loop start, and interpolation treats Loop end − 1 → Loop start as adjacent frames** | Oscillator phases keep running, so the wrap has no waveform discontinuity. Only partial levels and frequencies change, and they are interpolated over one frame (~10 ms). No crossfade buffers needed: this is the advantage of looping the model rather than the audio. |
| **A one-frame loop (Loop end = Loop start + 1) behaves exactly like the Phase 3 freeze** | Keeps the old behaviour available and gives a parity test: every existing voice test runs through regions with a one-frame loop. |
| **Default loop: starts at `findSustainFrame`, 20 frames (~0.2 s) long, clamped to End** | Reuses the steadiest-frame choice. A short loop near the steady part sounds alive without an obvious pulse; the user can widen or narrow it. |
| **Auto trim: first and last frame whose energy ≥ peak − 50 dB** | −50 dB is below a natural decay tail that matters musically but above typical recording noise. One threshold, one pure function, tested. |
| **Marker order is enforced by clamping the dragged marker between its neighbours**, with Loop end ≥ Loop start + 1 | Dragging never produces an invalid region and never moves another marker unexpectedly. `VoiceBank` still throws `RangeError` on invalid regions (a programming error, not user input). |
| **Release leaves the loop**: after note-off the voice plays on from its position to End, under the release fade | Same release rule as Phase 3; a pluck keeps its natural tail. |
| **Live region updates** (`setRegions`) do not restart voices; a voice past the new End ends, a held voice past the new Loop end wraps on its next block | Lets the user drag while holding a note and hear the change. |
| **Markers drawn as an overlay on the existing waveform**, with dimmed trimmed-out areas and a tinted loop area | One timeline. Frame f is centred on sample f · hopSize (Phase 2 padding), so marker x = f · hopSize / sampleRate / duration. |
| **Markers are keyboard-accessible**: focusable handles, ←/→ move 1 frame, Shift+←/→ move 10 frames | Dragging is not the only way to edit. Arrow keys on a focused handle do not play notes (the Phase 3 typing guard is extended to handles). |

### Deviation from golden rules

- **No feature flag (rule 7)**, as in Phases 2–3. The one-frame-loop parity test covers the old freeze behaviour.

## API contracts (compiling stubs in unit 0)

```ts
// src/synth/regions.ts
/** Frame indices into a SpectralModel. 0 ≤ startFrame ≤ loopStart < loopEnd ≤ endFrame ≤ frameCount. */
export interface PlayRegions { startFrame: number; loopStart: number; loopEnd: number; endFrame: number }
export type MarkerName = 'startFrame' | 'loopStart' | 'loopEnd' | 'endFrame'
export const TRIM_FLOOR_DB = -50
export const DEFAULT_LOOP_FRAMES = 20
export function findTrim(model: SpectralModel): { startFrame: number; endFrame: number }
export function defaultRegions(model: SpectralModel): PlayRegions
/** Moves one marker to `frame`, clamped between its neighbours. */
export function moveMarker(regions: PlayRegions, marker: MarkerName, frame: number, frameCount: number): PlayRegions
/** Throws RangeError when the order rule above is broken. */
export function assertRegions(regions: PlayRegions, frameCount: number): void

// src/synth/voices.ts (changed)
class VoiceBank {
  setModel(model: SpectralModel, regions: PlayRegions): void   // was (model, sustainFrame)
  setRegions(regions: PlayRegions): void                         // new; keeps voices playing
}

// src/synth/messages.ts (changed)
| { type: 'model'; model: SpectralModel; regions: PlayRegions }   // was sustainFrame
| { type: 'regions'; regions: PlayRegions }                        // new

// src/synth/engine.ts (changed)
interface SynthEngine {
  load(model: SpectralModel, regions: PlayRegions): void          // was load(model)
  setRegions(regions: PlayRegions): void                           // new
}

// src/composables/useSynth.ts (added)
regions: Ref<PlayRegions | null>        // set to defaultRegions(model) on load; sent to the engine on change
moveMarker(marker: MarkerName, frame: number): void
resetRegions(): void

// src/components/WaveformView.vue (added props / emits)
props: { regions?: PlayRegions | null; framesToSeconds?: (frame: number) => number; secondsToFrame?: (s: number) => number }
emits: { marker: [marker: MarkerName, frame: number] }
```

Breaking change: `VoiceBank.setModel`, the `model` message and `SynthEngine.load` take regions instead of a sustain frame. All callers are in this repository and change in unit 0.

## Files

| File | Change |
|---|---|
| `src/synth/regions.ts` | **New.** Trim, default regions, marker moves, validation |
| `src/synth/voices.ts` | Regions instead of sustain frame; start/end trim; loop wrap; `setRegions` |
| `src/synth/messages.ts`, `src/synth/worklet/processor.ts`, `src/synth/engine.ts` | `regions` message, `setRegions` |
| `src/composables/useSynth.ts` | `regions` state, `moveMarker`, `resetRegions`; typing guard also skips marker handles |
| `src/components/WaveformView.vue` | Marker overlay, shading, drag and keyboard handles |
| `src/App.vue` | Pass regions to the waveform when a model exists; "Reset markers" button |
| `test/regions.test.ts` | **New** |
| `test/voices.test.ts` | Migrate to regions (one-frame loop = old freeze); add trim and loop tests |
| `README.md` | Markers and loop |

## Test plan

```
regions.test.ts  (100 frames per second)
  - 0.3 s silence + 1 s tone + 0.5 s silence -> startFrame 30 ± 1, endFrame 130 ± 1
  - no silence -> startFrame 0, endFrame frameCount
  - tail at −40 dB below the peak is kept; tail at −60 dB is trimmed
  - all-silent model -> startFrame 0, endFrame frameCount (nothing to trim against)
  - defaultRegions: loopStart = findSustainFrame (clamped into the trim), loopEnd = loopStart + 20
  - defaultRegions on a sound shorter than 20 frames after the sustain frame -> loopEnd = endFrame, loopStart < loopEnd
  - one-frame model -> { startFrame 0, loopStart 0, loopEnd 1, endFrame 1 }
  - moveMarker, for each of the 4 markers: to a frame inside its neighbours -> moved there exactly
  - moveMarker, for each of the 4 markers: below its lower neighbour / above its upper neighbour -> clamped to it
  - moveMarker loopEnd to loopStart -> loopStart + 1 (loop never empty); loopStart to loopEnd -> loopEnd − 1
  - moveMarker leaves the other three markers unchanged
  - assertRegions: valid -> no throw; each order rule broken -> RangeError (5 cases)

voices.test.ts  (existing tests now use a one-frame loop at the old sustain frame: parity with Phase 3 freeze)
  - held note with loop [10, 30) on a model whose level falls 1.0 -> 0.2 across frames 10..29: at 2–3 s the level still swings between ~1.0 and ~0.2 (the loop repeats)
  - loop seam does not click: level 0.2 at loopEnd − 1 and 1.0 at loopStart, 100 Hz full scale -> max sample step < 0.05 over 3 s
  - startFrame 20 on a model silent in frames 0..19 -> output reaches full level within 10 ms (playback starts at the marker)
  - endFrame 50 of 100, release slow -> a released voice ends by frame 50 (0.5 s)
  - noteOff inside the loop -> the voice continues past loopEnd towards endFrame, not back to loopStart
  - setRegions while a note is held -> voiceCount unchanged, the new loop is heard (level follows the new loop frames)
  - setRegions with endFrame before a released voice's position -> that voice ends on the next block
  - setRegions with invalid regions -> RangeError, previous regions kept
```

**Not test-first, and why:** `WaveformView` marker overlay, `useSynth` wiring, `App.vue`. DOM and pointer glue over tested functions. Covered by the manual steps.

**Manual verification** (Chrome):

1. Load a sound with 0.5 s of silence before it and analyse: Start sits where the sound begins; a key press sounds at once (no silent gap).
2. Drag End left to mid-sound: released notes stop there.
3. Hold a note: it repeats the loop region. Drag Loop end wider and narrower while holding: the repeat changes with no click and the note does not restart.
4. Drag Loop end to one frame after Loop start: the held note sounds frozen, as in Phase 3.
5. Try to drag a marker past its neighbour: it stops at the neighbour.
6. Focus a marker with Tab, use ←/→ and Shift+←/→: it moves 1 / 10 frames; no notes play.
7. Select "Reset markers": markers return to the automatic positions.
8. Click the waveform outside a marker: playback seeks as before.
9. Light and dark mode, 375 px width: markers are visible and draggable with touch.

## Out of scope

- Saving markers, or exporting the trimmed sound.
- Crossfade-length control, ping-pong loops, several loops.
- Re-analysing the trimmed region; trimming the "Play resynthesis" A/B (it stays the full analysis).
- Zoom on the waveform.
- Snapping markers to zero crossings or pitch periods (not needed: the loop is in the spectral domain).

## Definition of done

- [ ] `npm test` passes; every test above exists
- [ ] Red then green commits for `regions` and the voice bank changes
- [ ] `npm run build` passes
- [ ] All Phase 3 voice tests pass with a one-frame loop (parity)
- [ ] Held notes repeat the loop region with no seam click (`voices.test.ts`, manual 3)
- [ ] Start and End trim playback (`voices.test.ts`, manual 1–2)
- [ ] Automatic trim and loop placement (`regions.test.ts`, manual 1, 7)
- [ ] Markers never cross (`regions.test.ts`, manual 5)
- [ ] Markers move with mouse, touch and keyboard, also while a note sounds (manual 3, 6, 9)
- [ ] README updated

## Acceptance criteria

1. After analysis, a key press sounds at once, with leading silence skipped. → DoD 6, 7
2. A held note repeats the region between Loop start and Loop end without clicks, for as long as the key is down. → DoD 5
3. The user can move all four markers by mouse, touch or keyboard, and hears the result at once. → DoD 9
4. Markers keep their order, so playback never gets an invalid region. → DoD 8
5. A one-frame loop gives the Phase 3 frozen sustain. → DoD 4

## Phases (commit units)

| # | Unit | Depends on |
|---|---|---|
| 0 | Stubs for `regions.ts`; change `VoiceBank`/messages/engine/useSynth to take regions (loop start used as the freeze frame); migrate voice tests to one-frame loops — all existing tests stay green | – |
| 1 | `regions.ts` (red, green) | 0 |
| 2 | VoiceBank trim and loop (red, green) | 0 |
| 3 | Waveform markers, useSynth regions, App, README (manual) | 1, 2 |

Units 1 and 2 are independent.

## UI text (ASD-STE100)

| Where | Text |
|---|---|
| Marker labels | Start · Loop start · Loop end · End |
| Marker handle (screen reader) | Start marker, 0.42 s. Use the arrow keys to move it. |
| Button | Reset markers |
| Hint under the waveform | Drag the markers to trim the sound and set the loop. |
