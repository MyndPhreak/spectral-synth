import { describe, expect, it } from 'vitest'
import { findPeaks } from '../src/audio/peaks'
import { mix, silence, sine, SR } from './signals'

const FRAME = 2048

function frameOf(signal: Float32Array): Float32Array {
  return signal.subarray(0, FRAME)
}

describe('findPeaks', () => {
  it('off-bin 1000 Hz sine, amp 0.5 -> one peak, hz within 1 Hz, amp within 2 %', () => {
    const peaks = findPeaks(frameOf(sine(1000, 0.1, SR, 0.5)), SR)
    expect(peaks).toHaveLength(1)
    expect(Math.abs(peaks[0].hz - 1000)).toBeLessThanOrEqual(1)
    expect(Math.abs(peaks[0].amp - 0.5) / 0.5).toBeLessThanOrEqual(0.02)
  })

  it('1000 Hz at 0.5 and 1500 Hz at 0.25 -> two peaks, strongest first', () => {
    const peaks = findPeaks(frameOf(mix(sine(1000, 0.1, SR, 0.5), sine(1500, 0.1, SR, 0.25))), SR)
    expect(peaks).toHaveLength(2)
    expect(Math.abs(peaks[0].hz - 1000)).toBeLessThanOrEqual(1)
    expect(Math.abs(peaks[1].hz - 1500)).toBeLessThanOrEqual(1)
    expect(peaks[0].amp).toBeGreaterThan(peaks[1].amp)
  })

  it('component 90 dB below the strongest -> dropped at the default -80 dB floor', () => {
    const quiet = 10 ** (-90 / 20)
    const peaks = findPeaks(frameOf(mix(sine(1000, 0.1, SR, 1), sine(5000, 0.1, SR, quiet))), SR)
    expect(peaks.map((p) => Math.round(p.hz / 100))).toEqual([10])
  })

  it('component 60 dB below the strongest -> kept at the default floor', () => {
    const quiet = 10 ** (-60 / 20)
    const peaks = findPeaks(frameOf(mix(sine(1000, 0.1, SR, 1), sine(5000, 0.1, SR, quiet))), SR)
    expect(peaks).toHaveLength(2)
  })

  it('20 sines with maxPeaks 8 -> the 8 strongest', () => {
    const tones = Array.from({ length: 20 }, (_, i) => sine(300 + i * 400, 0.1, SR, 0.02 * (i + 1)))
    const peaks = findPeaks(frameOf(mix(...tones)), SR, { maxPeaks: 8 })
    expect(peaks).toHaveLength(8)
    const expectedHz = Array.from({ length: 8 }, (_, i) => 300 + (19 - i) * 400)
    peaks.forEach((p, i) => expect(Math.abs(p.hz - expectedHz[i])).toBeLessThanOrEqual(1))
  })

  it('silence -> no peaks', () => {
    expect(findPeaks(frameOf(silence(0.1)), SR)).toEqual([])
  })
})
