import { describe, expect, it } from 'vitest'
import { detectPitch, pitchTrack, summarisePitch, type PitchFrame } from '../src/audio/pitch'
import { concat, harmonics, noise, sawtooth, silence, sine, SR } from './signals'

const FRAME = 2048

function frameOf(signal: Float32Array): Float32Array {
  return signal.subarray(0, FRAME)
}

function expectWithin(actual: number, expected: number, fraction: number) {
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(fraction)
}

describe('detectPitch', () => {
  it('220 Hz sine at 44.1 kHz -> f0 within 0.5 %', () => {
    const p = detectPitch(frameOf(sine(220, 0.1, SR)), SR)
    expectWithin(p.f0, 220, 0.005)
    expect(p.clarity).toBeGreaterThan(0.8)
  })

  it('220 Hz sine at 48 kHz -> f0 within 0.5 %', () => {
    expectWithin(detectPitch(frameOf(sine(220, 0.1, 48000)), 48000).f0, 220, 0.005)
  })

  it('110 Hz sawtooth -> 110 Hz, not an octave up', () => {
    expectWithin(detectPitch(frameOf(sawtooth(110, 0.1)), SR).f0, 110, 0.005)
  })

  it('harmonics 2..6 of 150 Hz with no fundamental -> 150 Hz', () => {
    expectWithin(detectPitch(frameOf(harmonics(150, [2, 3, 4, 5, 6], 0.1)), SR).f0, 150, 0.005)
  })

  it('seeded white noise -> unvoiced', () => {
    expect(detectPitch(frameOf(noise(0.1, SR, 3)), SR).f0).toBe(0)
  })

  it('silence -> unvoiced with clarity 0', () => {
    expect(detectPitch(frameOf(silence(0.1)), SR)).toEqual({ f0: 0, clarity: 0 })
  })

  it('30 Hz sine, below minHz -> unvoiced', () => {
    expect(detectPitch(frameOf(sine(30, 0.1)), SR).f0).toBe(0)
  })

  it('3000 Hz sine, above maxHz -> unvoiced', () => {
    expect(detectPitch(frameOf(sine(3000, 0.1)), SR).f0).toBe(0)
  })
})

describe('pitchTrack', () => {
  it('frame count is floor((length - frameSize) / hop) + 1', () => {
    const signal = sine(220, 0.5)
    expect(pitchTrack(signal, SR, FRAME, 441).length).toBe(Math.floor((signal.length - FRAME) / 441) + 1)
  })

  it('signal shorter than one frame -> no frames', () => {
    expect(pitchTrack(sine(220, 0.01), SR, FRAME, 441)).toEqual([])
  })

  it('220 Hz then 330 Hz -> frames fully before the change read 220, fully after read 330', () => {
    const hop = 441
    const boundary = Math.round(0.5 * SR)
    const track = pitchTrack(concat(sine(220, 0.5), sine(330, 0.5)), SR, FRAME, hop)
    track.forEach((p, i) => {
      const start = i * hop
      if (start + FRAME <= boundary) expectWithin(p.f0, 220, 0.005)
      if (start >= boundary) expectWithin(p.f0, 330, 0.005)
    })
  })
})

describe('summarisePitch', () => {
  const voiced = (f0: number, clarity = 0.9): PitchFrame => ({ f0, clarity })
  const unvoiced: PitchFrame = { f0: 0, clarity: 0 }

  it('fewer than 20 % voiced frames -> not pitched', () => {
    const track = [voiced(220), ...Array.from({ length: 9 }, () => unvoiced)]
    expect(summarisePitch(track).pitched).toBe(false)
  })

  it('20 % or more voiced frames -> pitched', () => {
    const track = [voiced(220), voiced(220), ...Array.from({ length: 8 }, () => unvoiced)]
    expect(summarisePitch(track).pitched).toBe(true)
  })

  it('root is the median voiced f0, so outliers and unvoiced frames do not move it', () => {
    const track = [voiced(220), voiced(221), voiced(219), voiced(440), voiced(220), unvoiced, unvoiced]
    expect(summarisePitch(track).rootHz).toBe(220)
  })

  it('confidence is the clarity sum of voiced frames over all frames', () => {
    const track = [voiced(220, 1), voiced(220, 0.5), unvoiced, unvoiced]
    expect(summarisePitch(track).confidence).toBeCloseTo(0.375, 9)
  })

  it('empty track -> not pitched, root 0, confidence 0', () => {
    expect(summarisePitch([])).toEqual({ pitched: false, rootHz: 0, confidence: 0 })
  })
})
