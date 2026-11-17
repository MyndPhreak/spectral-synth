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
3. **Play**: Web MIDI input, polyphony, ADSR envelope.
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
  synth/
    additive.ts       SpectralModel -> audio at any pitch
  composables/
    useSample.ts      the current sample, shared app-wide
    useRecorder.ts    MediaRecorder capture -> AudioBuffer
    usePlayback.ts    buffer playback with playhead position
    useAnalysis.ts    runs analysis + resynthesis on the current sample
  components/
    SourceInput.vue   file drop/browse + record button
    WaveformView.vue  canvas waveform, click to seek
    AnalysisPanel.vue Analyse button, result, original / resynthesis playback
  App.vue
test/                 Vitest unit tests on synthetic signals (signals.ts)
```

Synth engines read a `SpectralModel`: per-frame partial amplitudes and frequency ratios to `rootHz`, so any note plays as `ratio × targetHz`.
