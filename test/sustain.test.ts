import { describe, expect, it } from 'vitest'
import { findSustainFrame } from '../src/synth/sustain'
import { makeModel, steady, type Frame } from './models'

// makeModel defaults: 44.1 kHz, hop 441 -> 100 frames per second.
const FRAMES_PER_SECOND = 100

/** Three harmonics at levels 1, 0.5, 0.25 scaled by `level`. */
const tone = (level: number, detune = 0): Frame => [
  [1 + detune, level],
  [2 + detune, level * 0.5],
  [3 + detune, level * 0.25],
]

const energy = (frame: Frame) => frame.reduce((sum, [, a]) => sum + a * a, 0)

describe('findSustainFrame', () => {
  it('flat tone after a 5-frame attack ramp -> a frame in the flat region', () => {
    const frames = [...[0.2, 0.4, 0.6, 0.8].map((l) => tone(l)), ...steady(tone(1), 100)]
    const s = findSustainFrame(makeModel(frames, 220))
    expect(s).toBeGreaterThanOrEqual(4)
    expect(s).toBeLessThan(104)
  })

  it('pluck: peak at frame 3 then exponential decay -> frame at or after the peak, within -12 dB of it', () => {
    const levels = Array.from({ length: 300 }, (_, f) => (f <= 3 ? (f + 1) / 4 : Math.exp(-(f - 3) / 40)))
    const frames = levels.map((l) => tone(l))
    const s = findSustainFrame(makeModel(frames, 220))
    expect(s).toBeGreaterThanOrEqual(3)
    expect(10 * Math.log10(energy(frames[s]) / energy(frames[3]))).toBeGreaterThanOrEqual(-12)
  })

  it('unstable start (partials jumping in pitch) then steady -> a frame in the steady region', () => {
    const unstable = Array.from({ length: 20 }, (_, f) => tone(1, f % 2 ? 0.05 : -0.05))
    const s = findSustainFrame(makeModel([...unstable, ...steady(tone(1), 100)], 220))
    expect(s).toBeGreaterThanOrEqual(20)
  })

  it('silent frames before the sound -> a frame after the silence', () => {
    const silent = steady(tone(0), 30)
    const s = findSustainFrame(makeModel([...silent, ...steady(tone(1), 50)], 220))
    expect(s).toBeGreaterThanOrEqual(30)
  })

  it('choice is limited to 1 s after the peak, even when a steadier frame comes later', () => {
    // Slight vibrato for 3 s, then a perfectly steady tail at the same level.
    const vibrato = Array.from({ length: 3 * FRAMES_PER_SECOND }, (_, f) => tone(1, 0.002 * Math.sin(f)))
    const s = findSustainFrame(makeModel([...vibrato, ...steady(tone(1), 100)], 220))
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(FRAMES_PER_SECOND)
  })

  it('one-frame model -> 0', () => {
    expect(findSustainFrame(makeModel([tone(1)], 220))).toBe(0)
  })
})
