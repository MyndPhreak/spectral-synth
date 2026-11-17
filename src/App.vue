<script setup lang="ts">
import { computed } from 'vue'
import AnalysisPanel from './components/AnalysisPanel.vue'
import SourceInput from './components/SourceInput.vue'
import WaveformView from './components/WaveformView.vue'
import { useSample } from './composables/useSample'
import { usePlayback } from './composables/usePlayback'

const { sample, setSample } = useSample()
const buffer = computed(() => sample.value?.buffer ?? null)
const { playing, position, play, toggle } = usePlayback(buffer)

const info = computed(() => {
  const b = buffer.value
  if (!b) return ''
  const ch = b.numberOfChannels === 1 ? 'mono' : `${b.numberOfChannels} ch`
  return `${b.duration.toFixed(2)}s · ${(b.sampleRate / 1000).toFixed(1)} kHz · ${ch}`
})
</script>

<template>
  <main>
    <header>
      <h1>Spectral Synth</h1>
      <p>Capture a sound, analyse its harmonics, play it as an instrument.</p>
    </header>

    <div class="card">
      <h2>1 · Capture</h2>
      <SourceInput @loaded="setSample" />
    </div>

    <div v-if="sample && buffer" class="card">
      <div class="row">
        <div>
          <h2>{{ sample.name }}</h2>
          <p class="meta">{{ info }}</p>
        </div>
        <button class="primary" @click="toggle">{{ playing ? 'Pause' : 'Play' }}</button>
      </div>
      <WaveformView :buffer="buffer" :position="position" @seek="play" />
    </div>

    <div class="card">
      <h2>2 · Analyse</h2>
      <AnalysisPanel />
    </div>
  </main>
</template>

<style scoped>
main {
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
header h1 {
  margin: 0 0 6px;
  font-size: 28px;
  letter-spacing: -0.02em;
}
header p,
.meta {
  margin: 0;
  color: var(--muted);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.row h2 {
  overflow-wrap: anywhere;
}
.meta {
  font-size: 13px;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
</style>
