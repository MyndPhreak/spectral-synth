import { describe, expect, it } from 'vitest'
import { parseMidiMessage } from '../src/input/midi'

const msg = (...bytes: number[]) => new Uint8Array(bytes)

describe('parseMidiMessage', () => {
  it('note-on 60 velocity 100 -> noteOn', () => {
    expect(parseMidiMessage(msg(0x90, 60, 100))).toEqual({ type: 'noteOn', note: 60, velocity: 100 })
  })

  it('note-on on channel 6 -> noteOn (all channels accepted)', () => {
    expect(parseMidiMessage(msg(0x95, 60, 100))).toEqual({ type: 'noteOn', note: 60, velocity: 100 })
  })

  it('note-on with velocity 0 -> noteOff', () => {
    expect(parseMidiMessage(msg(0x90, 60, 0))).toEqual({ type: 'noteOff', note: 60, velocity: 0 })
  })

  it('note-off -> noteOff with its release velocity', () => {
    expect(parseMidiMessage(msg(0x80, 60, 64))).toEqual({ type: 'noteOff', note: 60, velocity: 64 })
    expect(parseMidiMessage(msg(0x8f, 72, 0))).toEqual({ type: 'noteOff', note: 72, velocity: 0 })
  })

  it('sustain pedal control change -> null', () => {
    expect(parseMidiMessage(msg(0xb0, 64, 127))).toBeNull()
  })

  it('timing clock and a truncated note message -> null', () => {
    expect(parseMidiMessage(msg(0xf8))).toBeNull()
    expect(parseMidiMessage(msg(0x90, 60))).toBeNull()
    expect(parseMidiMessage(msg())).toBeNull()
  })
})
