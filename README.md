# Spectral Synth

Tech demo: capture a sound, analyse it with an FFT, and resynthesise it as a playable, MIDI-driven instrument.

Built with Vue 3, TypeScript, Vite and the Web Audio API. No other runtime dependencies.

## Run

```sh
npm install
npm run dev
npm test
```

Microphone recording needs `localhost` or HTTPS.

## Status

1. **Capture** (done): load an audio file (drag and drop or browse) or record from the mic, decode to an `AudioBuffer`, view the waveform, play and seek.
2. **Analyse** (done): YIN pitch detection, FFT peak picking, a time-varying partials model (harmonic mode for pitched sounds, peak tracking otherwise) and additive resynthesis to A/B against the original. Plan: [docs/plans/2026-11-17-analyse-phase.md](docs/plans/2026-11-17-analyse-phase.md).
3. **Play** (done): an AudioWorklet bank of 8 additive voices plays the model at any note. Held notes freeze on a sustain frame; released notes play on under a release fade. Input from the computer keyboard, Web MIDI and an on-screen piano. Plan: [docs/plans/2026-11-17-play-phase.md](docs/plans/2026-11-17-play-phase.md).
4. **Polish**: spectrum view, controls, presets.

## Layout

```
src/
  audio/
    context.ts        shared AudioContext + resume on user gesture
    sample.ts         Sample type, decode, toMono, waveform peaks
    model.ts          SpectralModel (the synth contract), AnalysisError
    fft.ts            radix-2 FFT, Hann window
    pitch.ts          YIN pitch per frame, pitch summary
    peaks.ts          spectral peaks with sub-bin frequency and amplitude
    partials.ts       harmonic assignment, peak tracking across frames
    analyse.ts        signal -> SpectralModel pipeline
    notes.ts          note names, Hz -> nearest MIDI note
  synth/
    additive.ts       SpectralModel -> audio at any pitch (offline)
    voices.ts         real-time voice bank: sustain freeze, release, stealing
    sustain.ts        chooses the frame a held note freezes on
    engine.ts         AudioWorklet setup and message sending
    messages.ts       main thread -> worklet messages
    worklet/          AudioWorklet processor around voices.ts
  input/
    keyboard.ts       computer keys -> MIDI notes
    midi.ts           Web MIDI parsing and device connection
  composables/
    useSample.ts      the current sample, shared app-wide
    useRecorder.ts    MediaRecorder capture -> AudioBuffer
    usePlayback.ts    buffer playback with playhead position
    useAnalysis.ts    runs analysis + resynthesis on the current sample
    useSynth.ts       engine lifecycle, held notes, keyboard and MIDI input
  components/
    SourceInput.vue   file drop/browse + record button
    WaveformView.vue  canvas waveform, click to seek
    AnalysisPanel.vue Analyse button, result, original / resynthesis playback
    PlayPanel.vue     piano, octave, release, MIDI status
    PianoKeys.vue     on-screen piano with pointer glide
  App.vue
test/                 Vitest unit tests on synthetic signals (signals.ts)
```

Synth engines read a `SpectralModel`: per-frame partial amplitudes and frequency ratios to `rootHz`, so any note plays as `ratio × targetHz`.

## Play keys

| Keys | Notes |
|---|---|
| A S D F G H J K L ; | white keys, C to E of the next octave |
| W E T Y U O P | black keys |
| Z / X | octave down / up |

A new sound starts in the octave that holds its original pitch (red dot on the piano). MIDI controllers on any channel also play; Chrome asks for MIDI permission when the first sound is ready.
