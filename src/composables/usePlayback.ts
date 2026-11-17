import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { resumeAudio } from '../audio/context'

/** Plays an AudioBuffer and exposes the playhead position in seconds. */
export function usePlayback(buffer: Ref<AudioBuffer | null>) {
  const playing = ref(false)
  const position = ref(0)

  let node: AudioBufferSourceNode | null = null
  let startedAt = 0
  let raf = 0

  function stop() {
    if (node) {
      node.onended = null
      node.stop()
      node.disconnect()
      node = null
    }
    cancelAnimationFrame(raf)
    playing.value = false
  }

  async function play(from = 0) {
    if (!buffer.value) return
    stop()
    const ctx = await resumeAudio()
    node = ctx.createBufferSource()
    node.buffer = buffer.value
    node.connect(ctx.destination)
    node.onended = () => {
      stop()
      position.value = 0
    }
    startedAt = ctx.currentTime - from
    node.start(0, from)
    playing.value = true
    const tick = () => {
      position.value = ctx.currentTime - startedAt
      raf = requestAnimationFrame(tick)
    }
    tick()
  }

  function toggle() {
    playing.value ? stop() : play(position.value >= (buffer.value?.duration ?? 0) ? 0 : position.value)
  }

  watch(buffer, () => {
    stop()
    position.value = 0
  })
  onBeforeUnmount(stop)

  return { playing, position, play, stop, toggle }
}
