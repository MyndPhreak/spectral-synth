<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePeaks } from '../audio/sample'

const props = defineProps<{ buffer: AudioBuffer; position: number }>()
const emit = defineEmits<{ seek: [seconds: number] }>()

const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let peaks: Float32Array | null = null
let observer: ResizeObserver | null = null

function draw() {
  const el = canvas.value
  if (!el || !wrap.value) return
  const dpr = window.devicePixelRatio || 1
  const w = wrap.value.clientWidth
  const h = wrap.value.clientHeight
  el.width = w * dpr
  el.height = h * dpr
  const g = el.getContext('2d')!
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)

  const styles = getComputedStyle(el)
  const wave = styles.getPropertyValue('--accent').trim()
  const played = styles.getPropertyValue('--text').trim()
  const mid = h / 2

  if (!peaks || peaks.length !== Math.floor(w) * 2) peaks = computePeaks(props.buffer, Math.floor(w))
  const headX = (props.position / props.buffer.duration) * w

  for (let x = 0; x < peaks.length / 2; x++) {
    const min = peaks[x * 2]
    const max = peaks[x * 2 + 1]
    g.fillStyle = x < headX ? played : wave
    g.fillRect(x, mid - max * mid * 0.95, 1, Math.max(1, (max - min) * mid * 0.95))
  }

  if (props.position > 0) {
    g.fillStyle = played
    g.fillRect(headX, 0, 1.5, h)
  }
}

function onClick(e: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  emit('seek', ((e.clientX - rect.left) / rect.width) * props.buffer.duration)
}

watch(() => props.buffer, () => ((peaks = null), draw()))
watch(() => props.position, draw)
onMounted(() => {
  observer = new ResizeObserver(draw)
  observer.observe(wrap.value!)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="wrap" class="wave">
    <canvas ref="canvas" @click="onClick" />
  </div>
</template>

<style scoped>
.wave {
  height: 160px;
  position: relative;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
</style>
