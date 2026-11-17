# Plan: Phase 2 · Analyse

Status: draft for review · 2026-11-17

## Summary

Phase 1 can load or record a sound and play it back. Phase 2 turns that sound into a **spectral model**: a set of partials (sine components), each with an amplitude and a frequency for every analysis frame, about every 10 ms. Pitched sounds are analysed as harmonics of a detected fundamental (YIN pitch detection plus FFT peak picking). Sounds with no stable pitch fall back to tracking the strongest spectral peaks. An **additive synth** then renders the model back to audio at any target pitch, so the user can A/B the resynthesis against the original. The model is the contract every later synth engine (wavetable, noise residual, Phase 3 MIDI voices) reads.

Decisions from the user (2026-11-17): additive synth only in this phase; the model keeps frames over time; unpitched sounds fall back to peak tracking with a message.

## Architectural decisions

| Decision | Reason |
|---|---|
| **Hand-written radix-2 FFT** (~40 lines) in `src/audio/fft.ts` | The project has no runtime deps besides Vue (README). `AnalyserNode` only works in real time, gives dB magnitudes with no phase, and cannot be stepped frame by frame offline. A library (e.g. `fft.js`) would save ~40 lines and add a dependency; not worth it. |
| **Analysis functions take `(Float32Array, sampleRate)`, never `AudioBuffer`** | `AudioBuffer` does not exist in Node, so this keeps all DSP unit-testable under Vitest without a browser. The composable does the `toMono` call at the edge. |
| **YIN for pitch, with the difference function computed via FFT autocorrelation** | YIN is robust against octave errors on harmonic-rich sounds. A naive difference function is O(W²) per frame (~10⁹ ops for 10 s); the FFT form is O(W log W). |
| **Frame 2048 samples, Hann window, hop = round(0.01 · sampleRate)** | 2048 at 44.1/48 kHz resolves fundamentals down to ~40 Hz (≥ 2 periods per frame). Hop of 10 ms is the resolution the user chose. FFT size must be a power of two; hop does not. |
| **Peak frequency by parabolic interpolation on log magnitude; amplitude corrected by the Hann coherent gain (0.5)** | Gives sub-bin frequency accuracy (≪ 1 Hz) and true linear amplitude, which the additive synth needs to match the original level. |
| **One model shape for both modes: partial frequency stored as a ratio to `rootHz`** | The synth plays any note by `freq = ratio · targetHz`, the same code path for both modes. Harmonic mode: `rootHz` = median f0 of voiced frames; ratios stay near k but keep measured inharmonicity (e.g. piano strings). Peaks mode: `rootHz` = 261.63 Hz (C4) by convention, so the sample plays at its original pitch on middle C. |
| **Peaks mode uses greedy nearest-frequency tracking (McAulay–Quatieri, simplified)** | Assigns each frame's peaks to the existing partial slot with the closest frequency (within 3 %), opens a new slot when none match, and leaves the slot at amp 0 when its peak ends. Enough for a demo; birth/death smoothing is out of scope. |
| **Additive render in pure TS to a `Float32Array`** (phase-accumulating oscillators, linear amp/freq interpolation between frames) | Testable in Node, and reuses `usePlayback` for listening via a new `AudioBuffer`. Real-time AudioWorklet voices belong to Phase 3. |
| **Partials at or above Nyquist for the target pitch are muted** | Prevents aliasing when a sound is played higher than it was recorded. |
| **Explicit failure via `AnalysisError` with a code** (`too-short`, `too-long`, `silent`, `bad-input`) | Each code maps to one STE100 message in the UI. Nothing fails silently; no partial model is ever stored. |
| **Limit input to 30 s; run on the main thread** | 30 s ≈ 3 000 frames, estimated well under 1 s. A Web Worker is the follow-up if the budget in the DoD is missed. |
| **Add Vitest 3.x (dev only)** | Required for test-first. Vitest 3 supports the installed Vite 6.2.7. |

### Deviation from golden rules

- **No feature flag (rule 7).** This is a greenfield tech demo with no users and no existing behaviour to protect. The new code adds a new card; it does not change the Capture path. A flag plus a parity test would need `@vue/test-utils` and jsdom only for this. Recorded here as a deviation; say if you want the flag anyway.

## API contracts (landed as compiling stubs in commit 1)

No HTTP surface. The contracts are the TS module interfaces and the model shape.

```ts
// src/audio/model.ts
export const MODEL_VERSION = 1

export type AnalysisMode = 'harmonic' | 'peaks'

export interface SpectralModel {
  version: typeof MODEL_VERSION
  sampleRate: number
  hopSize: number            // samples between frames
  frameCount: number
  mode: AnalysisMode
  rootHz: number             // ratios are relative to this
  pitchConfidence: number    // 0..1, share of voiced frames weighted by YIN clarity
  partialCount: number
  amp: Float32Array          // frameCount × partialCount, row-major, linear amplitude
  ratio: Float32Array        // same layout; frequency / rootHz; 0 where silent
  f0Track: Float32Array      // per-frame f0 in Hz, 0 when unvoiced
}

export type AnalysisErrorCode = 'too-short' | 'too-long' | 'silent' | 'bad-input'
export class AnalysisError extends Error {
  constructor(readonly code: AnalysisErrorCode, message: string)
}
```

Unknown `version` handling: the model is in memory only (not persisted) in this phase; `renderAdditive` throws `RangeError` on a version it does not know, so a future persisted model cannot be misread silently.

```ts
// src/audio/fft.ts
export function fft(re: Float64Array, im: Float64Array): void          // in place; length power of 2, else RangeError
export function hann(size: number): Float64Array

// src/audio/pitch.ts
export interface PitchFrame { f0: number; clarity: number }            // f0 0 when unvoiced
export interface PitchOptions { minHz: number; maxHz: number; threshold: number } // defaults 40, 2000, 0.15
export function detectPitch(frame: Float32Array, sampleRate: number, opts?: Partial<PitchOptions>): PitchFrame
export function pitchTrack(signal: Float32Array, sampleRate: number, frameSize: number, hop: number): PitchFrame[]
export function summarisePitch(track: PitchFrame[]): { pitched: boolean; rootHz: number; confidence: number }

// src/audio/peaks.ts
export interface Peak { hz: number; amp: number }
export function findPeaks(frame: Float32Array, sampleRate: number, opts?: { maxPeaks?: number; floorDb?: number }): Peak[] // sorted by amp desc

// src/audio/partials.ts
export function assignHarmonics(peaks: Peak[], f0: number, rootHz: number, partialCount: number, tolerance?: number): { amp: Float32Array; ratio: Float32Array }
export function trackPeaks(framesPeaks: Peak[][], rootHz: number, maxPartials: number): { amp: Float32Array; ratio: Float32Array; partialCount: number }

// src/audio/analyse.ts
export interface AnalyseOptions { frameSize: number; maxSeconds: number; maxPartials: number } // defaults 2048, 30, 64
export function analyse(signal: Float32Array, sampleRate: number, opts?: Partial<AnalyseOptions>): SpectralModel // throws AnalysisError

// src/synth/additive.ts
export function renderAdditive(model: SpectralModel, targetHz: number): Float32Array // length frameCount × hopSize, peak ≤ 1

// src/composables/useAnalysis.ts
export function useAnalysis(): {
  model: ShallowRef<SpectralModel | null>
  status: Ref<'idle' | 'running' | 'done' | 'error'>
  error: Ref<string | null>             // STE100 text for the UI
  resynth: ShallowRef<AudioBuffer | null>
  run(): Promise<void>                  // analyses useSample().sample; clears state when the sample changes
}
```

## Files

| File | Change |
|---|---|
| `package.json` | Add `vitest` (dev), `"test": "vitest run"` script |
| `src/audio/model.ts` | **New.** Model type, version, `AnalysisError` |
| `src/audio/fft.ts` | **New.** FFT, Hann window |
| `src/audio/pitch.ts` | **New.** YIN (FFT difference), pitch track, summary |
| `src/audio/peaks.ts` | **New.** Peak picking with interpolation and gain correction |
| `src/audio/partials.ts` | **New.** Harmonic assignment, peak tracking |
| `src/audio/analyse.ts` | **New.** Pipeline, input validation, mode choice |
| `src/synth/additive.ts` | **New.** Additive renderer |
| `src/composables/useAnalysis.ts` | **New.** State, runs analysis on the current sample, builds the resynth `AudioBuffer` |
| `src/components/AnalysisPanel.vue` | **New.** Analyse button, result summary, Play original / Play resynthesis |
| `src/App.vue` | Replace the muted placeholder card with `AnalysisPanel` |
| `test/signals.ts` | **New.** Test helpers: sine, sawtooth, missing-fundamental tone, seeded noise |
| `test/*.test.ts` | **New.** See Test plan |
| `README.md` | Mark Analyse done; add new files to Layout |

## Test plan

All DSP tests run in Node under Vitest on synthetic signals from `test/signals.ts` (seeded PRNG, no fixture files).

```
fft.test.ts
  - impulse -> every bin magnitude 1
  - sine exactly on bin 8 of N=64 -> energy only in bins 8 and 56, magnitude N/2
  - random input N=256 -> matches naive DFT within 1e-9
  - length 100 -> throws RangeError
  - hann(N) -> first value 0, centre value 1, length N

pitch.test.ts
  - 220 Hz sine at 44.1 kHz -> f0 within 0.5 %
  - 220 Hz sine at 48 kHz -> f0 within 0.5 %
  - 110 Hz sawtooth -> 110 Hz, not 220 (no octave error)
  - harmonics 2..6 of 150 Hz, fundamental absent -> 150 Hz
  - seeded white noise -> unvoiced (f0 0)
  - silence -> unvoiced, clarity 0
  - 30 Hz sine (below minHz) -> unvoiced
  - 3000 Hz sine (above maxHz) -> unvoiced
  - pitchTrack frame count = floor((len - frameSize) / hop) + 1
  - 220 Hz then 330 Hz -> track switches within 2 frames of the boundary
  - summarisePitch: < 20 % voiced frames -> pitched false
  - summarisePitch: rootHz is the median of voiced frames, ignores outliers

peaks.test.ts
  - 1000 Hz sine, amp 0.5, off-bin -> one peak, hz within 1 Hz, amp within 2 %
  - 1000 + 1500 Hz, amps 0.5 / 0.25 -> two peaks, sorted by amp
  - component 90 dB below the strongest -> dropped (default floor -80 dB)
  - 20 sines, maxPeaks 8 -> 8 strongest returned
  - silence -> empty list

partials.test.ts
  - 220 Hz sawtooth peaks -> harmonic k amp ≈ 1/k relative to k=1 within 5 %, k = 1..10
  - same -> ratio within 0.5 % of k
  - harmonic 3 missing -> amp[2] 0, ratio[2] 0
  - peak 10 % off a harmonic (tolerance 3 %) -> not assigned
  - trackPeaks: steady 300 + 770 Hz -> 2 partials, stable slot per peak, ratio = hz / rootHz
  - trackPeaks: partial that starts mid-sound -> new slot, amp 0 before its start
  - trackPeaks: partial that ends -> amp 0 after its end
  - trackPeaks: more distinct peaks than maxPartials -> partialCount == maxPartials, weakest dropped

analyse.test.ts
  - 1 s sawtooth 220 Hz -> mode harmonic, rootHz within 0.5 %, confidence > 0.8
  - same -> version 1, amp.length == ratio.length == frameCount × partialCount, f0Track.length == frameCount
  - same -> partialCount == min(maxPartials, floor(nyquist / rootHz))
  - 1 s seeded noise -> mode peaks, rootHz 261.63
  - inharmonic 300 + 770 Hz -> mode peaks, 2 non-silent partials
  - input shorter than frameSize -> AnalysisError 'too-short'
  - input longer than maxSeconds -> AnalysisError 'too-long'
  - all zeros -> AnalysisError 'silent'
  - sampleRate 0 / NaN, or NaN samples -> AnalysisError 'bad-input'

additive.test.ts
  - model of one 440 Hz partial, target 440 -> strongest output peak 440 Hz ± 1 Hz
  - same model, target 880 -> strongest peak 880 Hz ± 1 Hz
  - output length == frameCount × hopSize
  - sawtooth model rendered at a target where upper partials pass Nyquist -> no peak with amp above 0.01 at any folded (aliased) frequency
  - amp step 0 -> 1 between two frames -> output envelope ramps over one hop, no step
  - loud model -> output peak ≤ 1
  - unknown model version -> RangeError
  - round trip: analyse(sawtooth 220) -> render at 220 -> analyse again: harmonic amps 1..10 within 1 dB of the first analysis
```

**Not test-first, and why:** `useAnalysis.ts`, `AnalysisPanel.vue` and the `App.vue` change. They are thin glue over tested functions plus `AudioBuffer`/Web Audio, which do not exist in Node, and adding a browser test harness for one card is not justified. Covered by the manual steps below.

**Manual verification** (`npm run dev`, Chrome):

1. Load a sustained instrument note (e.g. a cello or flute WAV). Select **Analyse**. The card shows a note name, frequency and "Harmonic" mode within 1 s for a 10 s file.
2. Select **Play resynthesis**, then **Play original**. The pitch is the same and the timbre is recognisably the same instrument.
3. Load a drum hit. Select **Analyse**. The card shows "No pitch found. The sound is analysed as separate peaks." and resynthesis plays.
4. Record 2 s of silence. Select **Analyse**. The card shows "The sound is silent. Record or load a different sound."
5. Load a file longer than 30 s. The card shows "The sound is too long. Use a sound of 30 seconds or less."
6. While analysis runs, the button shows "Analysing…" and is disabled. Load a new sample after analysis: the result clears.

## Out of scope

- Wavetable, noise-residual, subtractive and FM engines (the model is designed so they can read it later).
- MIDI input, polyphony, ADSR, real-time AudioWorklet voices (Phase 3).
- Spectrogram / partials visualisation, parameter controls, presets (Phase 4).
- Web Worker for analysis (follow-up only if manual step 1 misses the 1 s budget).
- Saving or loading models.
- Partial birth/death smoothing, multi-pitch (chords) detection.
- Feature flag (see Deviation).

## Definition of done

- [ ] `npm test` passes; every test in the Test plan exists with the listed name/behaviour
- [ ] Each unit landed as a red commit (failing on an assertion) followed by a green commit
- [ ] `npm run build` passes (vue-tsc, no `any`)
- [ ] Sawtooth 220 Hz analyses as harmonic, root within 0.5 % (`analyse.test.ts`)
- [ ] Noise analyses as peaks with root 261.63 Hz (`analyse.test.ts`)
- [ ] Each `AnalysisError` code is raised by its input (`analyse.test.ts`) and shown as its STE100 message (manual 3–5)
- [ ] Round-trip harmonic amps within 1 dB (`additive.test.ts`)
- [ ] No alias energy when partials pass Nyquist (`additive.test.ts`)
- [ ] 10 s sample analyses in under 1 s on the dev machine (manual 1)
- [ ] Resynthesis is audibly the same pitch and instrument as the original (manual 2)
- [ ] README Status and Layout updated

## Acceptance criteria

1. Given a loaded pitched sound, when the user selects Analyse, the system shows its detected pitch and plays a resynthesis at that pitch on request. → DoD 4, 9, 10
2. Given a sound with no stable pitch, the system still builds a model from spectral peaks and tells the user that no pitch was found. → DoD 5, 6
3. Given silent, too-short, too-long or invalid input, the system shows one specific message and keeps no model. → DoD 6
4. Resynthesis at the original pitch reproduces the harmonic balance of the original within 1 dB. → DoD 7
5. Resynthesis at a higher pitch does not alias. → DoD 8

## Phases (commit units)

Each unit is two commits: `Add failing tests for <area>`, then `Implement <area>`.

| # | Unit | Depends on | Parallel? |
|---|---|---|---|
| 0 | Vitest setup + contract stubs (`model.ts` and every signature above, bodies `throw new Error('not implemented')`) + `test/signals.ts` | – | – |
| 1 | FFT + Hann | 0 | yes, with 4 |
| 2 | Pitch (YIN) | 1 | yes, with 3 |
| 3 | Peaks + partials | 1 | yes, with 2 |
| 4 | Additive renderer | 0 (model type only; round-trip test waits for 5) | yes, with 1–3 |
| 5 | `analyse` pipeline + round-trip test | 2, 3, 4 | – |
| 6 | `useAnalysis` + `AnalysisPanel` + App + README | 5 | – (manual verification) |

## UI text (ASD-STE100)

| Where | Text |
|---|---|
| Button | Analyse · Analysing… |
| Result | Pitch: A3 · 220.0 Hz · Harmonic · 24 partials |
| Peaks mode | No pitch found. The sound is analysed as separate peaks. |
| `too-short` | The sound is too short. Use a sound of 0.05 seconds or more. |
| `too-long` | The sound is too long. Use a sound of 30 seconds or less. |
| `silent` | The sound is silent. Record or load a different sound. |
| `bad-input` | The app cannot read this sound. Load a different file. |
| Buttons | Play original · Play resynthesis · Stop |
