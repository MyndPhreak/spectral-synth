import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { analyse } from '../audio/analyse'
import { getAudioContext } from '../audio/context'
import { AnalysisError, type AnalysisErrorCode, type SpectralModel } from '../audio/model'
import { toMono } from '../audio/sample'
import { renderAdditive } from '../synth/additive'
import { useSample } from './useSample'

export const ANALYSIS_STATUS = { Idle: 'idle', Running: 'running', Done: 'done', Error: 'error' } as const
export type AnalysisStatus = (typeof ANALYSIS_STATUS)[keyof typeof ANALYSIS_STATUS]

/** STE100 text for each analysis failure. */
export const ANALYSIS_MESSAGES: Record<AnalysisErrorCode | 'unexpected', string> = {
  'too-short': 'The sound is too short. Use a sound of 0.05 seconds or more.',
  'too-long': 'The sound is too long. Use a sound of 30 seconds or less.',
  silent: 'The sound is silent. Record or load a different sound.',
  'bad-input': 'The app cannot read this sound. Load a different file.',
  unexpected: 'The analysis failed. Try again or load a different sound.',
}

export interface UseAnalysis {
  model: ShallowRef<SpectralModel | null>
  status: Ref<AnalysisStatus>
  /** STE100 message for the UI. */
  error: Ref<string | null>
  resynth: ShallowRef<AudioBuffer | null>
  /** Analyses the current sample. State clears when the sample changes. */
  run(): Promise<void>
}

const model = shallowRef<SpectralModel | null>(null)
const status = ref<AnalysisStatus>(ANALYSIS_STATUS.Idle)
const error = ref<string | null>(null)
const resynth = shallowRef<AudioBuffer | null>(null)

function clear() {
  model.value = null
  resynth.value = null
  error.value = null
  status.value = ANALYSIS_STATUS.Idle
}

const { sample } = useSample()
watch(sample, clear)

function toAudioBuffer(data: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = getAudioContext().createBuffer(1, Math.max(1, data.length), sampleRate)
  buffer.getChannelData(0).set(data)
  return buffer
}

async function run(): Promise<void> {
  const current = sample.value
  if (!current || status.value === ANALYSIS_STATUS.Running) return
  clear()
  status.value = ANALYSIS_STATUS.Running
  // Let the UI show the running state before the synchronous analysis blocks the main thread.
  await new Promise((resolve) => setTimeout(resolve, 0))
  try {
    const { buffer } = current
    const result = analyse(toMono(buffer), buffer.sampleRate)
    const rendered = toAudioBuffer(renderAdditive(result, result.rootHz), buffer.sampleRate)
    // A new sample arrived while this ran: its watcher already cleared state, so drop this result.
    if (sample.value !== current) return
    model.value = result
    resynth.value = rendered
    status.value = ANALYSIS_STATUS.Done
  } catch (e) {
    if (sample.value !== current) return
    if (e instanceof AnalysisError) {
      error.value = ANALYSIS_MESSAGES[e.code]
    } else {
      console.error('useAnalysis.run failed', { sample: current.name, duration: current.buffer.duration }, e)
      error.value = ANALYSIS_MESSAGES.unexpected
    }
    status.value = ANALYSIS_STATUS.Error
  }
}

export function useAnalysis(): UseAnalysis {
  return { model, status, error, resynth, run }
}
