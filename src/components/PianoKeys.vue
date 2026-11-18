<script setup lang="ts">
import { computed, ref } from 'vue'
import { noteName } from '../audio/notes'
import { KEY_SEMITONES } from '../input/keyboard'

const props = withDefaults(
  defineProps<{
    /** MIDI note of the first (C) key. */
    startNote: number
    octaves?: number
    held: ReadonlySet<number>
    /** Note that plays the sound at its original pitch, marked on the key. */
    rootNote?: number | null
    /** Show the computer-key letters on the keys they play. */
    showKeyHints?: boolean
  }>(),
  { octaves: 2, rootNote: null, showKeyHints: true },
)
const emit = defineEmits<{ press: [note: number]; release: [note: number] }>()

const BLACK = new Set([1, 3, 6, 8, 10])
/** Letter shown on a key: KeyA -> "A", Semicolon -> ";". */
const HINTS = new Map(
  Object.entries(KEY_SEMITONES).map(([code, semitone]) => [semitone, code === 'Semicolon' ? ';' : code.slice(3)]),
)

interface PianoKey {
  note: number
  black: boolean
  /** Left edge in % of the keyboard width. */
  left: number
  hint: string | null
}

const keys = computed<PianoKey[]>(() => {
  const count = props.octaves * 12 + 1
  const whiteCount = Array.from({ length: count }, (_, i) => i).filter((i) => !BLACK.has(i % 12)).length
  const whiteWidth = 100 / whiteCount
  let white = 0
  return Array.from({ length: count }, (_, i) => {
    const black = BLACK.has(i % 12)
    const left = black ? white * whiteWidth - whiteWidth * 0.3 : white++ * whiteWidth
    return { note: props.startNote + i, black, left, hint: props.showKeyHints ? (HINTS.get(i) ?? null) : null }
  })
})
const whiteWidth = computed(() => 100 / keys.value.filter((k) => !k.black).length)

// Pointer play: press on down, glide across keys while down, release on up.
const root = ref<HTMLDivElement>()
let pointerNote: number | null = null

function noteAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)
  const note = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-note]')?.dataset.note : undefined
  return note === undefined ? null : Number(note)
}

function moveTo(note: number | null) {
  if (note === pointerNote) return
  if (pointerNote !== null) emit('release', pointerNote)
  pointerNote = note
  if (note !== null) emit('press', note)
}

function onDown(e: PointerEvent) {
  root.value?.setPointerCapture(e.pointerId)
  moveTo(noteAt(e.clientX, e.clientY))
}

function onMove(e: PointerEvent) {
  if (pointerNote !== null) moveTo(noteAt(e.clientX, e.clientY))
}

function onUp() {
  moveTo(null)
}
</script>

<template>
  <div
    ref="root"
    class="piano"
    role="group"
    aria-label="Piano keyboard"
    @pointerdown.prevent="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
  >
    <div
      v-for="key in keys"
      :key="key.note"
      class="key"
      :class="{ black: key.black, white: !key.black, held: held.has(key.note) }"
      :style="{ left: `${key.left}%`, width: `${key.black ? whiteWidth * 0.6 : whiteWidth}%` }"
      :data-note="key.note"
      :aria-label="noteName(key.note)"
      :aria-pressed="held.has(key.note)"
    >
      <span v-if="key.note === rootNote" class="root" title="Original pitch" />
      <span v-if="held.has(key.note)" class="marker" />
      <span v-if="key.hint" class="hint">{{ key.hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.piano {
  --key-white: #ffffff;
  --key-black: #1d1d22;
  --key-black-hint: #c9c9d1;
  position: relative;
  height: 150px;
  user-select: none;
  touch-action: none;
}
@media (prefers-color-scheme: dark) {
  .piano {
    --key-white: #2c2c35;
    --key-black: #070709;
    --key-black-hint: #8d8d98;
  }
}
.key {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding-bottom: 8px;
  cursor: pointer;
}
.white {
  height: 100%;
  background: var(--key-white);
  border: 1px solid var(--line);
  border-radius: 0 0 8px 8px;
  z-index: 1;
}
.black {
  height: 62%;
  background: var(--key-black);
  border: 1px solid var(--line);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  z-index: 2;
}
.key.held {
  background: var(--accent);
  border-color: var(--accent);
}
.marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 2px var(--text);
}
.root {
  position: absolute;
  top: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rec);
}
.hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  pointer-events: none;
}
.black .hint {
  color: var(--key-black-hint);
}
.key.held .hint {
  color: #fff;
}
@media (max-width: 600px) {
  .hint {
    display: none;
  }
}
</style>
