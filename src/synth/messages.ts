import type { SpectralModel } from '../audio/model'
import type { VoiceSettings } from './voices'

/** Name the worklet processor registers under. */
export const PROCESSOR_NAME = 'additive-voices'

/** Messages from the main thread to the worklet processor. */
export type EngineMessage =
  | { type: 'model'; model: SpectralModel; sustainFrame: number }
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'allNotesOff' }
  | { type: 'settings'; settings: Partial<VoiceSettings> }
