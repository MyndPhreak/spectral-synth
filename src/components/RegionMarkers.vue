<script setup lang="ts">
import { computed, ref } from 'vue'
import { MARKER_ORDER, type MarkerName, type PlayRegions } from '../synth/regions'

const props = defineProps<{
  regions: PlayRegions
  /** Seconds per model frame (hopSize / sampleRate). */
  secondsPerFrame: number
  /** Length of the waveform in seconds. */
  duration: number
}>()
const emit = defineEmits<{
  /** Drag: move the marker to an absolute frame. */
  move: [marker: MarkerName, frame: number]
  /** Arrow keys: move the marker by a number of frames (relative, so fast key repeats do not read a stale prop). */
  nudge: [marker: MarkerName, frames: number]
}>()

const LABELS: Record<MarkerName, string> = {
  startFrame: 'Start',
  loopStart: 'Loop start',
  loopEnd: 'Loop end',
  endFrame: 'End',
}
const SMALL_STEP = 1
const LARGE_STEP = 10

const root = ref<HTMLDivElement>()

const toPercent = (frame: number) => Math.min(100, Math.max(0, ((frame * props.secondsPerFrame) / props.duration) * 100))
const pct = computed(() => ({
  startFrame: toPercent(props.regions.startFrame),
  loopStart: toPercent(props.regions.loopStart),
  loopEnd: toPercent(props.regions.loopEnd),
  endFrame: toPercent(props.regions.endFrame),
}))

const seconds = (marker: MarkerName) => (props.regions[marker] * props.secondsPerFrame).toFixed(2)

// Pointer drag: the handle captures the pointer, and x maps back to a frame.
let dragging: MarkerName | null = null

function frameAt(clientX: number): number {
  const rect = root.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return 0
  const fraction = (clientX - rect.left) / rect.width
  return (fraction * props.duration) / props.secondsPerFrame
}

function onDown(marker: MarkerName, e: PointerEvent) {
  dragging = marker
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onMove(e: PointerEvent) {
  if (dragging) emit('move', dragging, frameAt(e.clientX))
}

function onUp() {
  dragging = null
}

function onKey(marker: MarkerName, e: KeyboardEvent) {
  const step = e.shiftKey ? LARGE_STEP : SMALL_STEP
  if (e.key === 'ArrowLeft') emit('nudge', marker, -step)
  else if (e.key === 'ArrowRight') emit('nudge', marker, step)
  else return
  e.preventDefault()
}
</script>

<template>
  <div ref="root" class="markers">
    <div class="shade" :style="{ left: 0, width: `${pct.startFrame}%` }" />
    <div class="shade" :style="{ left: `${pct.endFrame}%`, right: 0 }" />
    <div class="loop" :style="{ left: `${pct.loopStart}%`, width: `${pct.loopEnd - pct.loopStart}%` }" />

    <div
      v-for="marker in MARKER_ORDER"
      :key="marker"
      class="handle"
      :class="[marker, marker === 'loopStart' || marker === 'loopEnd' ? 'is-loop' : 'is-trim']"
      :style="{ left: `${pct[marker]}%` }"
      :data-marker="marker"
      role="slider"
      tabindex="0"
      :aria-label="`${LABELS[marker]} marker`"
      :aria-valuenow="regions[marker]"
      :aria-valuetext="`${LABELS[marker]} marker, ${seconds(marker)} s. Use the arrow keys to move it.`"
      @pointerdown.stop.prevent="onDown(marker, $event)"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="onUp"
      @click.stop
      @keydown="onKey(marker, $event)"
    >
      <span class="line" />
      <span class="label">{{ LABELS[marker] }}</span>
    </div>
  </div>
</template>

<style scoped>
.markers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.shade {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
}
.loop {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--rec) 14%, transparent);
  border-top: 2px solid var(--rec);
  border-bottom: 2px solid var(--rec);
}
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20px;
  margin-left: -10px;
  pointer-events: auto;
  cursor: ew-resize;
  touch-action: none;
  outline: none;
}
.line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 9px;
  width: 2px;
  background: var(--text);
}
.is-loop .line {
  background: var(--rec);
}
.label {
  position: absolute;
  left: 13px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--surface);
  background: var(--text);
}
.is-trim .label {
  top: 2px;
}
.is-loop .label {
  bottom: 2px;
  background: var(--rec);
}
/* Loop labels point away from the loop so a narrow loop does not stack them; End points inward. */
.loopStart .label,
.endFrame .label {
  left: auto;
  right: 13px;
}
.handle:focus-visible .line {
  width: 4px;
  left: 8px;
  box-shadow: 0 0 0 2px var(--accent);
}
.handle:hover .line {
  width: 3px;
}
</style>
