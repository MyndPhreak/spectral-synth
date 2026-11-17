import { onBeforeUnmount, ref } from 'vue'
import { decodeBlob } from '../audio/sample'

/** Records from the microphone with MediaRecorder and decodes the result into an AudioBuffer. */
export function useRecorder() {
  const recording = ref(false)
  const elapsed = ref(0)
  const error = ref<string | null>(null)

  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let timer = 0

  function cleanup() {
    clearInterval(timer)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    recorder = null
    recording.value = false
  }

  async function start(): Promise<void> {
    error.value = null
    try {
      // Turn off voice processing so the recorded timbre stays faithful.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Microphone access was denied'
      return
    }
    recorder = new MediaRecorder(stream)
    recorder.start()
    recording.value = true
    const t0 = performance.now()
    elapsed.value = 0
    timer = window.setInterval(() => (elapsed.value = (performance.now() - t0) / 1000), 100)
  }

  function stop(): Promise<AudioBuffer | null> {
    const rec = recorder
    if (!rec) return Promise.resolve(null)
    return new Promise((resolve) => {
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = async () => {
        cleanup()
        try {
          resolve(await decodeBlob(new Blob(chunks, { type: rec.mimeType })))
        } catch {
          error.value = 'Could not decode the recording'
          resolve(null)
        }
      }
      rec.stop()
    })
  }

  onBeforeUnmount(() => {
    recorder?.state === 'recording' && recorder.stop()
    cleanup()
  })

  return { recording, elapsed, error, start, stop }
}
