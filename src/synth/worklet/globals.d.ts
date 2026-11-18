// Minimal AudioWorkletGlobalScope declarations: TypeScript's DOM lib does not include them.

declare const sampleRate: number

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void
