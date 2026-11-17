# Spectral Synth

Tech demo: capture a sound, analyse it with an FFT, and resynthesise it as a playable, MIDI-driven instrument.

Built with Vue 3, TypeScript, Vite and the Web Audio API. No other runtime dependencies.

## Run

```sh
npm install
npm run dev
```

Microphone recording needs `localhost` or HTTPS.

## Status

1. **Capture** (done): load an audio file (drag and drop or browse) or record from the mic, decode to an `AudioBuffer`, view the waveform, play and seek.
2. **Analyse**: pitch detection, FFT harmonic analysis, additive resynthesis.
3. **Play**: Web MIDI input, polyphony, ADSR envelope.
4. **Polish**: spectrum view, controls, presets.

## Layout

```
src/
  audio/
    context.ts        shared AudioContext + resume on user gesture
    sample.ts         Sample type, decode, toMono, waveform peaks
  composables/
    useSample.ts      the current sample, shared app-wide
    useRecorder.ts    MediaRecorder capture -> AudioBuffer
    usePlayback.ts    buffer playback with playhead position
  components/
    SourceInput.vue   file drop/browse + record button
    WaveformView.vue  canvas waveform, click to seek
  App.vue
```

The analysis step plugs in by reading `useSample().sample` and running on `toMono(sample.buffer)`.
