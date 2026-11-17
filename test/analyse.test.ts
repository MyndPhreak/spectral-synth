import { describe, expect, it } from 'vitest'
import { analyse } from '../src/audio/analyse'
import { AnalysisError, MODEL_VERSION, PEAKS_ROOT_HZ, type AnalysisErrorCode } from '../src/audio/model'
import { mix, noise, sawtooth, silence, sine, SR } from './signals'

function expectCode(fn: () => unknown, code: AnalysisErrorCode) {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(AnalysisError)
    expect((e as AnalysisError).code).toBe(code)
    return
  }
  throw new Error(`expected AnalysisError '${code}', nothing was thrown`)
}

/**
 * Partials above −60 dBFS in the steady state. Frames within one window of either end are skipped:
 * there the window straddles the abrupt start or end of the signal, which smears weak onset peaks.
 */
function audiblePartials(model: ReturnType<typeof analyse>, frameSize = 2048): number {
  const edge = Math.ceil(frameSize / model.hopSize)
  let count = 0
  for (let k = 0; k < model.partialCount; k++) {
    for (let f = edge; f < model.frameCount - edge; f++) {
      if (model.amp[f * model.partialCount + k] > 1e-3) {
        count++
        break
      }
    }
  }
  return count
}

describe('analyse', () => {
  const saw = analyse(sawtooth(220, 1), SR)

  it('1 s sawtooth 220 Hz -> harmonic mode, root within 0.5 %, confidence > 0.8', () => {
    expect(saw.mode).toBe('harmonic')
    expect(Math.abs(saw.rootHz - 220) / 220).toBeLessThanOrEqual(0.005)
    expect(saw.pitchConfidence).toBeGreaterThan(0.8)
  })

  it('model has version 1 and consistent array lengths', () => {
    expect(saw.version).toBe(MODEL_VERSION)
    expect(saw.sampleRate).toBe(SR)
    expect(saw.hopSize).toBe(441)
    expect(saw.amp.length).toBe(saw.frameCount * saw.partialCount)
    expect(saw.ratio.length).toBe(saw.frameCount * saw.partialCount)
    expect(saw.f0Track.length).toBe(saw.frameCount)
  })

  it('frames are centred on hop positions, so frameCount × hopSize covers the input', () => {
    expect(saw.frameCount).toBe(Math.floor(SR / 441) + 1)
  })

  it('partialCount is min(maxPartials, floor(nyquist / rootHz))', () => {
    expect(saw.partialCount).toBe(Math.min(64, Math.floor(SR / 2 / saw.rootHz)))
    const low = analyse(sawtooth(220, 1), SR, { maxPartials: 16 })
    expect(low.partialCount).toBe(16)
    const high = analyse(sawtooth(1500, 1), SR)
    expect(high.partialCount).toBe(Math.floor(SR / 2 / high.rootHz))
  })

  it('harmonic k of the sawtooth sits near ratio k in a middle frame', () => {
    const f = Math.floor(saw.frameCount / 2)
    for (let k = 1; k <= 10; k++) {
      expect(Math.abs(saw.ratio[f * saw.partialCount + k - 1] - k) / k).toBeLessThanOrEqual(0.005)
    }
  })

  it('1 s seeded noise -> peaks mode with root 261.63 Hz', () => {
    const model = analyse(noise(1, SR, 5), SR)
    expect(model.mode).toBe('peaks')
    expect(model.rootHz).toBe(PEAKS_ROOT_HZ)
  })

  it('two inharmonic sines (300 Hz and 300·π Hz) -> peaks mode with 2 audible partials', () => {
    const model = analyse(mix(sine(300, 1, SR, 0.4), sine(300 * Math.PI, 1, SR, 0.4)), SR)
    expect(model.mode).toBe('peaks')
    expect(audiblePartials(model)).toBe(2)
  })

  it('input shorter than one frame -> too-short', () => {
    expectCode(() => analyse(sine(220, 0.01), SR), 'too-short')
  })

  it('input longer than maxSeconds -> too-long', () => {
    expectCode(() => analyse(sine(220, 2.1), SR, { maxSeconds: 2 }), 'too-long')
  })

  it('all zeros -> silent', () => {
    expectCode(() => analyse(silence(1), SR), 'silent')
  })

  it('sample rate 0 or NaN -> bad-input', () => {
    expectCode(() => analyse(sine(220, 1), 0), 'bad-input')
    expectCode(() => analyse(sine(220, 1), NaN), 'bad-input')
  })

  it('NaN or Infinity samples -> bad-input', () => {
    const signal = sine(220, 1)
    signal[1000] = NaN
    expectCode(() => analyse(signal, SR), 'bad-input')
    signal[1000] = Infinity
    expectCode(() => analyse(signal, SR), 'bad-input')
  })
})
