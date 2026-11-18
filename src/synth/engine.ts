import type { SpectralModel } from '../audio/model'
import { PROCESSOR_NAME, type EngineMessage } from './messages'
import type { PlayRegions } from './regions'
import processorUrl from './worklet/processor.ts?worker&url'

export interface SynthEngine {
  /** Stops all notes, then sends the model and its markers. */
  load(model: SpectralModel, regions: PlayRegions): void
  /** Moves the markers; sounding notes keep playing. */
  setRegions(regions: PlayRegions): void
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  allNotesOff(): void
  setRelease(seconds: number): void
}

/** Master gain before the limiter: leaves headroom when several voices sum. */
const MASTER_GAIN = 0.5

const loadedContexts = new WeakSet<BaseAudioContext>()

/** Adds the worklet module (once per context) and builds worklet -> gain -> compressor -> destination. */
export async function createEngine(ctx: AudioContext): Promise<SynthEngine> {
  if (!loadedContexts.has(ctx)) {
    await ctx.audioWorklet.addModule(processorUrl)
    loadedContexts.add(ctx)
  }
  const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, { numberOfInputs: 0, outputChannelCount: [1] })
  const gain = new GainNode(ctx, { gain: MASTER_GAIN })
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.1 })
  node.connect(gain).connect(limiter).connect(ctx.destination)

  const send = (msg: EngineMessage) => node.port.postMessage(msg)
  return {
    load(model, regions) {
      send({ type: 'allNotesOff' })
      send({ type: 'model', model, regions })
    },
    setRegions: (regions) => send({ type: 'regions', regions }),
    noteOn: (note, velocity) => send({ type: 'noteOn', note, velocity }),
    noteOff: (note) => send({ type: 'noteOff', note }),
    allNotesOff: () => send({ type: 'allNotesOff' }),
    setRelease: (seconds) => send({ type: 'settings', settings: { releaseSeconds: seconds } }),
  }
}
