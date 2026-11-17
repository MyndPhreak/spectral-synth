import { describe, expect, it } from 'vitest'
import { fft, hann } from '../src/audio/fft'
import { rng } from './signals'

function magnitudes(re: Float64Array, im: Float64Array): number[] {
  return Array.from(re, (r, i) => Math.hypot(r, im[i]))
}

function naiveDft(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = input.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n
      re[k] += input[t] * Math.cos(a)
      im[k] += input[t] * Math.sin(a)
    }
  }
  return { re, im }
}

describe('fft', () => {
  it('impulse gives magnitude 1 in every bin', () => {
    const re = new Float64Array(16)
    const im = new Float64Array(16)
    re[0] = 1
    fft(re, im)
    for (const m of magnitudes(re, im)) expect(m).toBeCloseTo(1, 12)
  })

  it('sine exactly on bin 8 of N=64 puts N/2 in bins 8 and 56 only', () => {
    const n = 64
    const re = Float64Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * 8 * t) / n))
    const im = new Float64Array(n)
    fft(re, im)
    magnitudes(re, im).forEach((m, k) => {
      if (k === 8 || k === 56) expect(m).toBeCloseTo(n / 2, 9)
      else expect(m).toBeLessThan(1e-9)
    })
  })

  it('random input N=256 matches a naive DFT within 1e-9', () => {
    const next = rng(42)
    const input = Float64Array.from({ length: 256 }, () => next() * 2 - 1)
    const expected = naiveDft(input)
    const re = Float64Array.from(input)
    const im = new Float64Array(256)
    fft(re, im)
    for (let k = 0; k < 256; k++) {
      expect(Math.abs(re[k] - expected.re[k])).toBeLessThan(1e-9)
      expect(Math.abs(im[k] - expected.im[k])).toBeLessThan(1e-9)
    }
  })

  it('length that is not a power of two throws RangeError', () => {
    expect(() => fft(new Float64Array(100), new Float64Array(100))).toThrow(RangeError)
  })

  it('mismatched re/im lengths throw RangeError', () => {
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow(RangeError)
  })
})

describe('hann', () => {
  it('has length N, 0 at the first point and 1 at the centre', () => {
    const w = hann(1024)
    expect(w.length).toBe(1024)
    expect(w[0]).toBeCloseTo(0, 12)
    expect(w[512]).toBeCloseTo(1, 12)
  })

  it('is symmetric about the centre (periodic form)', () => {
    const w = hann(1024)
    expect(w[256]).toBeCloseTo(0.5, 12)
    for (let i = 1; i < 512; i++) expect(w[512 - i]).toBeCloseTo(w[512 + i], 12)
  })
})
