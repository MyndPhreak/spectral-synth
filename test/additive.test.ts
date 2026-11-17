import { describe, expect, it } from 'vitest'
import { type SpectralModel } from '../src/audio/model'
import { renderAdditive } from '../src/synth/additive'
import { analyse } from '../src/audio/analyse'
import { makeModel, steady } from './models'
import { magnitudeAt, peakAbs, sawtooth, SR, strongest } from './signals'

describe('renderAdditive', () => {
  it('one 440 Hz partial at target 440 -> strongest output is 440 Hz', () => {
    const out = renderAdditive(makeModel(steady([[1, 0.5]], 100), 440), 440)
    expect(Math.abs(strongest(out, 300, 1000) - 440)).toBeLessThanOrEqual(1)
  })

  it('same model at target 880 -> strongest output is 880 Hz', () => {
    const out = renderAdditive(makeModel(steady([[1, 0.5]], 100), 440), 880)
    expect(Math.abs(strongest(out, 300, 1500) - 880)).toBeLessThanOrEqual(1)
  })

  it('output length is frameCount × hopSize', () => {
    const out = renderAdditive(makeModel(steady([[1, 0.5]], 37), 440, 480), 440)
    expect(out.length).toBe(37 * 480)
  })

  it('partials above Nyquist at the target pitch are muted (no aliasing)', () => {
    const partials = Array.from({ length: 20 }, (_, i): [number, number] => [i + 1, 0.5 / (i + 1)])
    const target = 2000
    const out = renderAdditive(makeModel(steady(partials, 100), 220), target)
    const fundamental = magnitudeAt(out, target)
    expect(fundamental).toBeGreaterThan(0.1)
    for (let k = 1; k <= 20; k++) {
      if (k * target < SR / 2) continue
      const alias = Math.abs(SR - k * target)
      expect(magnitudeAt(out, alias) / fundamental).toBeLessThan(0.01)
    }
  })

  it('amp 0 -> 1 between frames ramps over one hop, no step', () => {
    const hop = 4410
    const out = renderAdditive(makeModel([[[1, 0]], [[1, 1]], [[1, 1]]], 1000, hop), 1000)
    // 1000 Hz at 44.1 kHz: one period ≈ 44 samples; local peak over a period gives the envelope.
    const env = (centre: number) => peakAbs(out.subarray(centre - 22, centre + 22))
    expect(peakAbs(out.subarray(0, 10))).toBeLessThan(0.01)
    expect(env(hop / 2)).toBeCloseTo(0.5, 1)
    expect(env(hop / 4)).toBeCloseTo(0.25, 1)
    expect(env(hop + hop / 2)).toBeCloseTo(1, 1)
  })

  it('many loud partials -> output peak ≤ 1', () => {
    const partials = Array.from({ length: 10 }, (_, i): [number, number] => [i + 1, 1])
    const out = renderAdditive(makeModel(steady(partials, 50), 110), 110)
    expect(peakAbs(out)).toBeLessThanOrEqual(1)
    expect(peakAbs(out)).toBeGreaterThan(0.9)
  })

  it('quiet output is not boosted', () => {
    const out = renderAdditive(makeModel(steady([[1, 0.1]], 50), 440), 440)
    expect(peakAbs(out)).toBeCloseTo(0.1, 2)
  })

  it('round trip: analyse(sawtooth 220) -> render at 220 -> analyse again keeps harmonics 1..10 within 1 dB', () => {
    const first = analyse(sawtooth(220, 1), SR)
    const second = analyse(renderAdditive(first, first.rootHz), SR)
    // Compare mean harmonic levels over the middle half of the frames (edges hold the padding ramps).
    const meanDb = (m: SpectralModel, k: number) => {
      const lo = Math.floor(m.frameCount / 4)
      const hi = Math.floor((3 * m.frameCount) / 4)
      let sum = 0
      for (let f = lo; f < hi; f++) sum += m.amp[f * m.partialCount + k]
      return 20 * Math.log10(sum / (hi - lo))
    }
    for (let k = 0; k < 10; k++) expect(Math.abs(meanDb(second, k) - meanDb(first, k))).toBeLessThanOrEqual(1)
  })

  it('unknown model version throws RangeError', () => {
    const model = { ...makeModel(steady([[1, 0.5]], 4), 440), version: 2 } as unknown as SpectralModel
    expect(() => renderAdditive(model, 440)).toThrow(RangeError)
  })
})
