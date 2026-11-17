<script setup lang="ts">
import { ref } from 'vue'
import { resumeAudio } from '../audio/context'
import { decodeBlob, type Sample } from '../audio/sample'
import { useRecorder } from '../composables/useRecorder'

const emit = defineEmits<{ loaded: [sample: Sample] }>()

const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const fileError = ref<string | null>(null)
const busy = ref(false)
const { recording, elapsed, error: micError, start, stop } = useRecorder()

async function loadFile(file: File) {
  fileError.value = null
  busy.value = true
  try {
    await resumeAudio()
    emit('loaded', { name: file.name, source: 'file', buffer: await decodeBlob(file) })
  } catch {
    fileError.value = `Couldn't decode “${file.name}”. Try WAV, MP3, OGG or M4A.`
  } finally {
    busy.value = false
  }
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) loadFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) loadFile(file)
}

async function toggleRecord() {
  if (!recording.value) {
    await resumeAudio()
    return start()
  }
  const buffer = await stop()
  if (buffer) {
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    emit('loaded', { name: `Recording ${stamp}`, source: 'mic', buffer })
  }
}
</script>

<template>
  <section class="sources">
    <div
      class="drop"
      :class="{ dragging }"
      role="button"
      tabindex="0"
      @click="fileInput?.click()"
      @keydown.enter.space.prevent="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input ref="fileInput" type="file" accept="audio/*" hidden @change="onPick" />
      <strong>{{ busy ? 'Decoding…' : 'Drop an audio file' }}</strong>
      <span>or click to browse</span>
    </div>

    <div class="or">or</div>

    <button class="record" :class="{ on: recording }" @click="toggleRecord">
      <span class="dot" />
      <template v-if="recording">Stop · {{ elapsed.toFixed(1) }}s</template>
      <template v-else>Record from mic</template>
    </button>

    <p v-if="fileError || micError" class="error">{{ fileError || micError }}</p>
  </section>
</template>

<style scoped>
.sources {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 16px;
}
.drop {
  border: 1.5px dashed var(--line);
  border-radius: 12px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop:hover,
.drop:focus-visible,
.drop.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
  outline: none;
}
.drop span,
.or {
  color: var(--muted);
  font-size: 14px;
}
.record {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 170px;
  justify-content: center;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--rec);
}
.record.on {
  border-color: var(--rec);
}
.record.on .dot {
  animation: pulse 1s infinite;
}
@keyframes pulse {
  50% { opacity: 0.25; }
}
.error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--rec);
  font-size: 14px;
}
@media (max-width: 600px) {
  .sources { grid-template-columns: 1fr; }
  .or { text-align: center; }
}
</style>
