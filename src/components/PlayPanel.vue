<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { hzToNote, noteName } from '../audio/notes'
import { MAX_OCTAVE, MIN_OCTAVE } from '../input/keyboard'
import type { MidiStatus } from '../input/midi'
import { useAnalysis } from '../composables/useAnalysis'
import { useSynth } from '../composables/useSynth'
import PianoKeys from './PianoKeys.vue'

const MIDI_TEXT: Record<MidiStatus, string> = {
  connected: 'MIDI: connected.',
  'no-devices': 'MIDI: no device found. Connect a device to play with MIDI.',
  unsupported: 'This browser does not support MIDI. Use the computer keyboard.',
  denied: 'MIDI access was denied. Use the computer keyboard.',
}

const { model } = useAnalysis()
const { ready, heldNotes, octave, releaseSeconds, midiStatus, audioSuspended, noteOn, noteOff, shiftOctave, attachInputs } =
  useSynth()

const rootNote = computed(() => (model.value ? hzToNote(model.value.rootHz) : null))
const startNote = computed(() => 12 * (octave.value + 1))

let detach: (() => void) | null = null
onMounted(() => (detach = attachInputs()))
onBeforeUnmount(() => detach?.())
</script>

<template>
  <section class="play">
    <p v-if="!model" class="meta">Analyse a sound to play it.</p>
    <template v-else>
      <PianoKeys
        :start-note="startNote"
        :held="heldNotes"
        :root-note="rootNote"
        @press="noteOn"
        @release="noteOff"
      />

      <div class="controls">
        <div class="octave">
          <button :disabled="octave <= MIN_OCTAVE" aria-label="Octave down" @click="shiftOctave(-1)">−</button>
          <span>Octave: {{ octave }}</span>
          <button :disabled="octave >= MAX_OCTAVE" aria-label="Octave up" @click="shiftOctave(1)">+</button>
        </div>
        <label class="release">
          <span>Release: {{ releaseSeconds.toFixed(2) }} s</span>
          <input v-model.number="releaseSeconds" type="range" min="0.05" max="5" step="0.05" />
        </label>
      </div>

      <p class="meta">Use the keys A to ; to play. Use Z and X to change the octave.</p>
      <p v-if="rootNote !== null" class="meta">
        <span class="dot" /> Original pitch: {{ noteName(rootNote) }}
      </p>
      <p v-if="!ready" class="meta" role="status">The synth is not ready.</p>
      <p v-else-if="audioSuspended" class="meta" role="status">Select the piano to start the sound.</p>
      <p v-if="midiStatus" class="meta">{{ MIDI_TEXT[midiStatus] }}</p>
    </template>
  </section>
</template>

<style scoped>
.play {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
p {
  margin: 0;
}
.meta {
  color: var(--muted);
  font-size: 13px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
}
.octave {
  display: flex;
  align-items: center;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}
.octave button {
  padding: 6px 12px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.release {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.release input {
  width: 180px;
  accent-color: var(--accent);
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rec);
  vertical-align: middle;
}
</style>
