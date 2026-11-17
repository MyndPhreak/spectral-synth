import { shallowRef } from 'vue'
import type { Sample } from '../audio/sample'

// Module-level so every component (and the future analysis/synth steps) shares one sample.
const sample = shallowRef<Sample | null>(null)

export function useSample() {
  return { sample, setSample: (s: Sample | null) => (sample.value = s) }
}
