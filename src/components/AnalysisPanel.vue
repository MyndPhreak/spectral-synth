<script setup lang="ts">
import { computed } from 'vue'
import { hzToNote, noteName } from '../audio/notes'
import { ANALYSIS_STATUS, useAnalysis } from '../composables/useAnalysis'
import { usePlayback } from '../composables/usePlayback'
import { useSample } from '../composables/useSample'

const { sample } = useSample()
const { model, status, error, resynth, run } = useAnalysis()
const original = usePlayback(computed(() => sample.value?.buffer ?? null))
const resynthesis = usePlayback(resynth)

const running = computed(() => status.value === ANALYSIS_STATUS.Running)

const summary = computed(() => {
  const m = model.value
  if (!m) return null
  const partials = `${m.partialCount} partials`
  return m.mode === 'harmonic'
    ? `Pitch: ${noteName(hzToNote(m.rootHz))} · ${m.rootHz.toFixed(1)} Hz · Harmonic · ${partials}`
    : `Peaks · ${partials}`
})

function playOriginal() {
  resynthesis.stop()
  original.toggle()
}

function playResynthesis() {
  original.stop()
  resynthesis.toggle()
}
</script>

<template>
  <section class="analysis">
    <div class="row">
      <button class="primary" :disabled="!sample || running" @click="run">Analyse</button>
      <p v-if="running" class="meta" role="status">Analysis is in progress.</p>
      <p v-else-if="!sample" class="meta">Load or record a sound first.</p>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="model">
      <p class="summary">{{ summary }}</p>
      <p v-if="model.mode === 'peaks'" class="meta">No pitch found. The sound is analysed as separate peaks.</p>
      <div class="row">
        <button @click="playOriginal">{{ original.playing.value ? 'Stop' : 'Play original' }}</button>
        <button :disabled="!resynth" @click="playResynthesis">
          {{ resynthesis.playing.value ? 'Stop' : 'Play resynthesis' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
p {
  margin: 0;
}
.meta {
  color: var(--muted);
  font-size: 13px;
}
.summary {
  font-variant-numeric: tabular-nums;
}
.error {
  color: var(--rec);
  font-size: 14px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
