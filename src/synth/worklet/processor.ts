/// <reference path="./globals.d.ts" />
import { PROCESSOR_NAME, type EngineMessage } from '../messages'
import { VoiceBank } from '../voices'

/** AudioWorklet glue: forwards engine messages to a VoiceBank and writes its output to every channel. */
class AdditiveVoicesProcessor extends AudioWorkletProcessor {
  private readonly bank = new VoiceBank(sampleRate)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<EngineMessage>) => this.handle(e.data)
  }

  private handle(msg: EngineMessage): void {
    switch (msg.type) {
      case 'model':
        this.bank.setModel(msg.model, msg.sustainFrame)
        break
      case 'noteOn':
        this.bank.noteOn(msg.note, msg.velocity)
        break
      case 'noteOff':
        this.bank.noteOff(msg.note)
        break
      case 'allNotesOff':
        this.bank.allNotesOff()
        break
      case 'settings':
        this.bank.setSettings(msg.settings)
        break
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [first, ...rest] = outputs[0] ?? []
    if (!first) return true
    this.bank.process(first)
    for (const channel of rest) channel.set(first)
    return true
  }
}

registerProcessor(PROCESSOR_NAME, AdditiveVoicesProcessor)
