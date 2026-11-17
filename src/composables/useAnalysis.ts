import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { notImplemented, type SpectralModel } from '../audio/model'

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

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
const status = ref<AnalysisStatus>('idle')
const error = ref<string | null>(null)
const resynth = shallowRef<AudioBuffer | null>(null)

export function useAnalysis(): UseAnalysis {
  return { model, status, error, resynth, run: () => notImplemented() }
}
