import { describe, expect, it } from 'vitest'
import { MODEL_VERSION, type SpectralModel } from '../src/audio/model'
import { renderAdditive } from '../src/synth/additive'
import { peakAbs, SR } from './signals'

/** One frame = list of [ratio, amp] per partial. All frames must have the same partial count. */
function makeModel(frames: [number, number][][], rootHz: number, hopSize = 441, sampleRate = SR): SpectralModel {
  const partialCount = frames[0].length
  const amp = new Float32Array(frames.length * partialCount)
  const ratio = new Float32Array(frames.length * partialCount)
  frames.forEach((f, i) =>
    f.forEach(([r, a], k) => {
      ratio[i * partialCount + k] = r
      amp[i * partialCount + k] = a
    }),
  )
  return {
    version: MODEL_VERSION,
    sampleRate,
    hopSize,
    frameCount: frames.length,
    mode: 'harmonic',
    rootHz,
    pitchConfidence: 1,
    partialCount,
    amp,
    ratio,
    f0Track: new Float32Array(frames.length).fill(rootHz),
  }
}

function steady(partials: [number, number][], frameCount: number): [number, number][][] {
  return Array.from({ length: frameCount }, () => partials)
}

/** Goertzel magnitude at `hz`, normalised so a full-scale sine reads ≈ its amplitude. */
function magnitudeAt(signal: Float32Array, hz: number, sampleRate = SR): number {
  const w = (2 * Math.PI * hz) / sampleRate
  const c = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (const x of signal) {
    const s0 = x + c * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / signal.length
}

/** Strongest frequency in [lo, hi] scanned in 0.5 Hz steps. */
function strongest(signal: Float32Array, lo: number, hi: number): number {
  let best = lo
  let bestMag = -1
  for (let hz = lo; hz <= hi; hz += 0.5) {
    const m = magnitudeAt(signal, hz)
    if (m > bestMag) [best, bestMag] = [hz, m]
  }
  return best
}

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

  it('unknown model version throws RangeError', () => {
    const model = { ...makeModel(steady([[1, 0.5]], 4), 440), version: 2 } as unknown as SpectralModel
    expect(() => renderAdditive(model, 440)).toThrow(RangeError)
  })
})
