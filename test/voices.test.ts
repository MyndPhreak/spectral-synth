import { describe, expect, it } from 'vitest'
import type { SpectralModel } from '../src/audio/model'
import type { PlayRegions } from '../src/synth/regions'
import { noteToHz, VoiceBank, type VoiceSettings } from '../src/synth/voices'
import { makeModel, steady, type Frame } from './models'
import { magnitudeAt, peakAbs, strongest } from './signals'

const SR = 48000
const HOP = 480 // 100 frames per second
const BLOCK = 128

const model = (frames: Frame[], rootHz: number) => makeModel(frames, rootHz, HOP, SR)
const sine440 = model(steady([[1, 0.5]], 100), 440)

/** Phase 3 freeze: a one-frame loop at the sustain frame, no trim. */
const freezeAt = (sustainFrame: number, frameCount: number): PlayRegions => ({
  startFrame: 0,
  loopStart: sustainFrame,
  loopEnd: sustainFrame + 1,
  endFrame: frameCount,
})

function bank(m: SpectralModel | null = sine440, sustainFrame = 50, settings?: Partial<VoiceSettings>): VoiceBank {
  const b = new VoiceBank(SR, settings)
  if (m) b.setModel(m, freezeAt(sustainFrame, m.frameCount))
  return b
}

/** Renders `seconds` of output in 128-sample blocks. */
function render(b: VoiceBank, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < out.length; i += BLOCK) b.process(out.subarray(i, Math.min(out.length, i + BLOCK)))
  return out
}

/** Peak level over 20 ms starting at `seconds`. */
const levelAt = (out: Float32Array, seconds: number) =>
  peakAbs(out.subarray(Math.round(seconds * SR), Math.round((seconds + 0.02) * SR)))

const maxStep = (out: Float32Array) => {
  let m = 0
  for (let i = 1; i < out.length; i++) m = Math.max(m, Math.abs(out[i] - out[i - 1]))
  return m
}

describe('noteToHz', () => {
  it.each([
    [69, 440],
    [57, 220],
    [81, 880],
    [60, 261.6255653],
  ])('note %i -> %f Hz', (note, hz) => {
    expect(noteToHz(note)).toBeCloseTo(hz, 5)
  })
})

describe('VoiceBank', () => {
  it('no notes -> output is all zeros', () => {
    expect(peakAbs(render(bank(), 0.1))).toBe(0)
  })

  it('noteOn before any model -> output stays zero, no throw', () => {
    const b = bank(null)
    expect(() => b.noteOn(69, 100)).not.toThrow()
    expect(peakAbs(render(b, 0.1))).toBe(0)
    expect(b.voiceCount).toBe(0)
  })

  it('root 440 model, note 69 -> 440 Hz', () => {
    const b = bank()
    b.noteOn(69, 127)
    expect(Math.abs(strongest(render(b, 0.5), 300, 1000, SR) - 440)).toBeLessThanOrEqual(1)
  })

  it('same model, note 81 -> 880 Hz', () => {
    const b = bank()
    b.noteOn(81, 127)
    expect(Math.abs(strongest(render(b, 0.5), 500, 1500, SR) - 880)).toBeLessThanOrEqual(1)
  })

  it('root 220 model, note 57 -> 220 Hz (the note nearest the root plays the original pitch)', () => {
    const b = bank(model(steady([[1, 0.5]], 100), 220))
    b.noteOn(57, 127)
    expect(Math.abs(strongest(render(b, 0.5), 100, 500, SR) - 220)).toBeLessThanOrEqual(1)
  })

  it('velocity 64 vs 127 -> level ratio (64/127)² within 1 %', () => {
    const loud = bank()
    const soft = bank()
    loud.noteOn(69, 127)
    soft.noteOn(69, 64)
    const ratio =
      magnitudeAt(render(soft, 0.5).subarray(SR * 0.1), 440, SR) / magnitudeAt(render(loud, 0.5).subarray(SR * 0.1), 440, SR)
    expect(Math.abs(ratio - (64 / 127) ** 2) / (64 / 127) ** 2).toBeLessThanOrEqual(0.01)
  })

  it('attack: first sample ~0, full level after attackSeconds, no click', () => {
    const b = bank()
    b.noteOn(69, 127)
    const out = render(b, 0.1)
    expect(Math.abs(out[0])).toBeLessThan(0.01)
    expect(levelAt(out, 0.006)).toBeCloseTo(0.5, 2)
    expect(maxStep(out)).toBeLessThan(0.05)
  })

  it('held note freezes on the sustain frame: level stays at that frame long after the model ends', () => {
    // Frames 0..4 at 1.0, frame 5 at 0.5, then decaying to 0.05 by the end of the 1 s model.
    const frames = Array.from({ length: 100 }, (_, f): Frame => [[1, f < 5 ? 1 : f === 5 ? 0.5 : 0.5 * Math.exp(-(f - 5) / 40)]])
    const b = bank(model(frames, 440), 5)
    b.noteOn(69, 127)
    const out = render(b, 3)
    expect(levelAt(out, 0.5)).toBeCloseTo(0.5, 2)
    expect(levelAt(out, 2.5)).toBeCloseTo(0.5, 2)
    expect(b.voiceCount).toBe(1)
  })

  it('noteOff before the sustain frame -> the voice plays on past it, it does not freeze', () => {
    // Level 1.0 for frames 0..59, 0.3 from frame 60; sustain frame 50; release very slow.
    const frames = Array.from({ length: 100 }, (_, f): Frame => [[1, f < 60 ? 1 : 0.3]])
    const b = bank(model(frames, 440), 50, { releaseSeconds: 60 })
    b.noteOn(69, 127)
    const out = new Float32Array(Math.round(0.9 * SR))
    b.process(out.subarray(0, 0.05 * SR)) // frame 5
    b.noteOff(69)
    for (let i = 0.05 * SR; i < out.length; i += BLOCK) b.process(out.subarray(i, Math.min(out.length, i + BLOCK)))
    const ratio = levelAt(out, 0.8) / levelAt(out, 0.4)
    expect(ratio).toBeGreaterThan(0.25)
    expect(ratio).toBeLessThan(0.32)
  })

  it('after noteOff the level falls ≥ 60 dB within releaseSeconds, then the voice ends', () => {
    const b = bank()
    b.noteOn(69, 127)
    render(b, 0.2)
    b.noteOff(69)
    const out = render(b, 0.6)
    expect(levelAt(out, 0)).toBeGreaterThan(0.4)
    expect(peakAbs(out.subarray(Math.round(0.5 * SR)))).toBeLessThan(0.5 * 1e-3)
    expect(b.voiceCount).toBe(0)
  })

  it('released note that reaches the model end before the fade ends -> voice ends at the model end', () => {
    const b = bank(model(steady([[1, 0.5]], 20), 440), 10, { releaseSeconds: 5 })
    b.noteOn(69, 127)
    render(b, 0.05)
    b.noteOff(69)
    const out = render(b, 0.3)
    expect(b.voiceCount).toBe(0)
    expect(peakAbs(out.subarray(Math.round(0.2 * SR)))).toBe(0)
  })

  it('noteOff for a note that is not playing -> no change', () => {
    const b = bank()
    b.noteOn(69, 127)
    render(b, 0.1)
    b.noteOff(70)
    expect(levelAt(render(b, 0.2), 0.1)).toBeCloseTo(0.5, 2)
    expect(b.voiceCount).toBe(1)
  })

  it('three held notes -> all three frequencies in the output', () => {
    const b = bank(model(steady([[1, 0.3]], 100), 220))
    for (const n of [57, 61, 64]) b.noteOn(n, 127)
    const out = render(b, 0.5).subarray(SR * 0.1)
    for (const n of [57, 61, 64]) expect(magnitudeAt(out, noteToHz(n), SR)).toBeGreaterThan(0.25)
    expect(b.voiceCount).toBe(3)
  })

  it('same note twice while held -> one voice (retrigger, no duplicate)', () => {
    const b = bank()
    b.noteOn(69, 127)
    render(b, 0.05)
    b.noteOn(69, 127)
    render(b, 0.05)
    expect(b.voiceCount).toBe(1)
  })

  it('9 notes with maxVoices 8 -> 8 voices, and the 9th note sounds', () => {
    const b = bank(model(steady([[1, 0.1]], 100), 220))
    for (let n = 60; n <= 68; n++) {
      b.noteOn(n, 127)
      render(b, 0.01)
    }
    expect(b.voiceCount).toBe(8)
    expect(magnitudeAt(render(b, 0.3).subarray(SR * 0.05), noteToHz(68), SR)).toBeGreaterThan(0.08)
  })

  it('stealing takes a released voice before the oldest held one', () => {
    const b = bank(model(steady([[1, 0.1]], 100), 220))
    for (let n = 60; n <= 67; n++) {
      b.noteOn(n, 127)
      render(b, 0.01)
    }
    b.noteOff(63)
    render(b, 0.01)
    b.noteOn(72, 127)
    const out = render(b, 0.3).subarray(SR * 0.05)
    expect(magnitudeAt(out, noteToHz(60), SR)).toBeGreaterThan(0.08) // oldest held: kept
    expect(magnitudeAt(out, noteToHz(63), SR)).toBeLessThan(0.01) // released: stolen
    expect(magnitudeAt(out, noteToHz(72), SR)).toBeGreaterThan(0.08)
  })

  it('stealing does not click: max sample step stays < 0.05 at full scale', () => {
    const b = bank(model(steady([[1, 1]], 100), 100), 50, { maxVoices: 1 })
    b.noteOn(43, 127)
    const first = render(b, 0.1)
    b.noteOn(45, 127)
    const second = render(b, 0.1)
    expect(peakAbs(first)).toBeGreaterThan(0.9)
    expect(maxStep(second)).toBeLessThan(0.05)
    expect(Math.abs(strongest(second.subarray(SR * 0.02), 80, 130, SR) - noteToHz(45))).toBeLessThanOrEqual(1.5)
  })

  it('allNotesOff -> every voice releases and ends within releaseSeconds', () => {
    const b = bank()
    for (const n of [60, 64, 67]) b.noteOn(n, 127)
    render(b, 0.1)
    b.allNotesOff()
    render(b, 0.55)
    expect(b.voiceCount).toBe(0)
  })

  it('setModel while notes sound -> silence from the next block, no voices', () => {
    const b = bank()
    b.noteOn(69, 127)
    render(b, 0.1)
    b.setModel(model(steady([[1, 0.5]], 100), 220), freezeAt(50, 100))
    expect(peakAbs(render(b, 0.05))).toBe(0)
    expect(b.voiceCount).toBe(0)
  })

  it('setModel with an unknown version -> RangeError', () => {
    const bad = { ...sine440, version: 2 } as unknown as SpectralModel
    expect(() => new VoiceBank(SR).setModel(bad, freezeAt(0, bad.frameCount))).toThrow(RangeError)
  })

  it('partials above Nyquist at a high note are muted (no aliasing)', () => {
    const partials = Array.from({ length: 20 }, (_, i): [number, number] => [i + 1, 0.3 / (i + 1)])
    const b = bank(model(steady(partials, 100), 220))
    b.noteOn(95, 127) // ≈ 1975.5 Hz
    const out = render(b, 0.5).subarray(SR * 0.05)
    const f = noteToHz(95)
    const fundamental = magnitudeAt(out, f, SR)
    expect(fundamental).toBeGreaterThan(0.2)
    for (let k = 1; k <= 20; k++) {
      if (k * f < SR / 2) continue
      expect(magnitudeAt(out, Math.abs(SR - k * f), SR) / fundamental).toBeLessThan(0.01)
    }
  })

  it('table sine matches Math.sin within 1e-5 after the attack', () => {
    const b = bank()
    b.noteOn(69, 127)
    const out = render(b, 1)
    let err = 0
    for (let n = 1000; n < out.length; n++) err = Math.max(err, Math.abs(out[n] - 0.5 * Math.sin((2 * Math.PI * 440 * n) / SR)))
    expect(err).toBeLessThan(1e-5)
  })

  it('setSettings releaseSeconds 2 -> about -30 dB after 1 s, ended after 2 s', () => {
    // 5 s model, so the release, not the model end, stops the voice.
    const b = bank(model(steady([[1, 0.5]], 500), 440))
    b.setSettings({ releaseSeconds: 2 })
    b.noteOn(69, 127)
    render(b, 0.2)
    b.noteOff(69)
    const out = render(b, 2.1)
    const db = 20 * Math.log10(levelAt(out, 1) / 0.5)
    expect(db).toBeGreaterThan(-35)
    expect(db).toBeLessThan(-25)
    expect(b.voiceCount).toBe(0)
  })
})

describe('VoiceBank trim and loop', () => {
  /** One partial at `rootHz`, level per frame from `levels`. */
  const levelModel = (levels: number[], rootHz = 440) => model(levels.map((a): Frame => [[1, a]]), rootHz)
  const regions = (startFrame: number, loopStart: number, loopEnd: number, endFrame: number): PlayRegions => ({
    startFrame,
    loopStart,
    loopEnd,
    endFrame,
  })
  const withRegions = (m: SpectralModel, r: PlayRegions, settings?: Partial<VoiceSettings>) => {
    const b = new VoiceBank(SR, settings)
    b.setModel(m, r)
    return b
  }
  /** Peak levels in 20 ms windows from `from` to `to` seconds. */
  const levelsBetween = (out: Float32Array, from: number, to: number) => {
    const levels: number[] = []
    for (let t = from; t < to; t += 0.02) levels.push(levelAt(out, t))
    return levels
  }
  // Level 1 for frames 0..9, falling 1.0 -> 0.2 across frames 10..29, then 0.2.
  const falling = Array.from({ length: 100 }, (_, f) => (f < 10 ? 1 : f < 30 ? 1 - (0.8 * (f - 10)) / 19 : 0.2))

  it('held note repeats the loop: long after the model would end, the level still swings between ~1.0 and ~0.2', () => {
    const b = withRegions(levelModel(falling), regions(0, 10, 30, 100))
    b.noteOn(69, 127)
    const levels = levelsBetween(render(b, 3), 2, 2.6)
    expect(Math.max(...levels)).toBeGreaterThan(0.85)
    // 20 ms peak windows smear the 0.2 dip slightly; a freeze would stay at one level and fail one bound.
    expect(Math.min(...levels)).toBeLessThan(0.35)
    expect(b.voiceCount).toBe(1)
  })

  it('loop seam does not click: level jumps 0.2 -> 1.0 at the wrap, max sample step stays < 0.05', () => {
    const b = withRegions(levelModel(falling.map((a) => a), 98), regions(0, 10, 30, 100))
    b.noteOn(43, 127) // ≈ 98 Hz, full scale
    const out = render(b, 3)
    expect(peakAbs(out)).toBeGreaterThan(0.9)
    expect(maxStep(out)).toBeLessThan(0.05)
  })

  it('startFrame 20 on a model silent in frames 0..19 -> full level within 10 ms', () => {
    const levels = Array.from({ length: 100 }, (_, f) => (f < 20 ? 0 : 0.5))
    const b = withRegions(levelModel(levels), regions(20, 50, 51, 100))
    b.noteOn(69, 127)
    expect(levelAt(render(b, 0.1), 0.01)).toBeCloseTo(0.5, 2)
  })

  it('endFrame 50 of 100 -> a released voice ends by frame 50 (0.5 s)', () => {
    const b = withRegions(sine440, regions(0, 10, 11, 50), { releaseSeconds: 60 })
    b.noteOn(69, 127)
    render(b, 0.05)
    b.noteOff(69)
    const out = render(b, 1)
    expect(peakAbs(out.subarray(Math.round(0.46 * SR)))).toBe(0)
    expect(b.voiceCount).toBe(0)
  })

  it('noteOff inside the loop -> the voice plays on past loopEnd towards endFrame', () => {
    // Level 1.0 for frames 0..59, 0.3 from frame 60; loop 10..19.
    const b = withRegions(levelModel(Array.from({ length: 100 }, (_, f) => (f < 60 ? 1 : 0.3))), regions(0, 10, 20, 100), {
      releaseSeconds: 60,
    })
    b.noteOn(69, 127)
    const held = render(b, 0.5)
    b.noteOff(69)
    const after = render(b, 0.8)
    const ratio = levelAt(after, 0.7) / levelAt(held, 0.4)
    expect(ratio).toBeGreaterThan(0.25)
    expect(ratio).toBeLessThan(0.32)
  })

  it('setRegions while held: a voice past the new loop end wraps into the new loop, without a restart', () => {
    // Level 1.0 for frames 0..49, 0.4 from frame 50; loop first at 60..69 (level 0.4), then moved to 10..19 (level 1.0).
    const b = withRegions(levelModel(Array.from({ length: 100 }, (_, f) => (f < 50 ? 1 : 0.4))), regions(0, 60, 70, 100))
    b.noteOn(69, 127)
    const before = render(b, 1)
    expect(levelAt(before, 0.9)).toBeCloseTo(0.4, 1)
    b.setRegions(regions(0, 10, 20, 100))
    const after = render(b, 0.5)
    expect(levelAt(after, 0.3)).toBeCloseTo(1, 1)
    expect(b.voiceCount).toBe(1)
  })

  it('setRegions with endFrame before a released voice -> the voice ends on the next block', () => {
    const b = withRegions(sine440, regions(0, 10, 11, 100), { releaseSeconds: 60 })
    b.noteOn(69, 127)
    render(b, 0.05)
    b.noteOff(69)
    render(b, 0.55) // position ≈ frame 60
    b.setRegions(regions(0, 10, 11, 40))
    const out = render(b, 0.1)
    expect(peakAbs(out.subarray(BLOCK))).toBe(0)
    expect(b.voiceCount).toBe(0)
  })

  it('setRegions with invalid regions -> RangeError, and playback keeps the old regions', () => {
    const b = withRegions(sine440, regions(0, 10, 11, 100))
    b.noteOn(69, 127)
    render(b, 0.2)
    expect(() => b.setRegions(regions(0, 30, 30, 100))).toThrow(RangeError)
    expect(levelAt(render(b, 0.5), 0.3)).toBeCloseTo(0.5, 2)
    expect(b.voiceCount).toBe(1)
  })
})
