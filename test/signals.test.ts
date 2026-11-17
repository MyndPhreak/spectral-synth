import { describe, expect, it } from 'vitest'
import { concat, mix, noise, peakAbs, sawtooth, silence, sine, SR } from './signals'

describe('test signals', () => {
  it('sine has the requested length and amplitude', () => {
    const s = sine(441, 1, SR, 0.5)
    expect(s.length).toBe(SR)
    expect(peakAbs(s)).toBeCloseTo(0.5, 3)
    // 441 Hz at 44.1 kHz repeats every 100 samples.
    expect(s[100]).toBeCloseTo(s[0], 5)
    expect(s[25]).toBeCloseTo(0.5, 5)
  })

  it('noise with the same seed is identical, different seed differs', () => {
    expect(noise(0.1, SR, 7)).toEqual(noise(0.1, SR, 7))
    expect(noise(0.1, SR, 7)).not.toEqual(noise(0.1, SR, 8))
    expect(peakAbs(noise(0.1))).toBeLessThanOrEqual(0.5)
  })

  it('sawtooth peak is near the requested amplitude', () => {
    expect(peakAbs(sawtooth(220, 0.1))).toBeGreaterThan(0.45)
    expect(peakAbs(sawtooth(220, 0.1))).toBeLessThan(0.6)
  })

  it('concat joins in order; mix sums to the longest length', () => {
    const c = concat(sine(100, 0.01), silence(0.01))
    expect(c.length).toBe(882)
    expect(peakAbs(c.subarray(441))).toBe(0)
    const m = mix(new Float32Array([1, 1]), new Float32Array([1]))
    expect(Array.from(m)).toEqual([2, 1])
  })
})
