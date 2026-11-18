import { describe, expect, it } from 'vitest'
import {
  assertRegions,
  DEFAULT_LOOP_FRAMES,
  defaultRegions,
  findTrim,
  MARKER_ORDER,
  moveMarker,
  type MarkerName,
  type PlayRegions,
} from '../src/synth/regions'
import { findSustainFrame } from '../src/synth/sustain'
import { makeModel, steady, type Frame } from './models'

// makeModel defaults: hop 441 at 44.1 kHz -> 100 frames per second.
const tone = (level: number): Frame => [
  [1, level],
  [2, level * 0.5],
]
const silence = (frames: number) => steady(tone(0), frames)
const db = (d: number) => 10 ** (d / 20)

describe('findTrim', () => {
  it('0.3 s silence + 1 s tone + 0.5 s silence -> start 30 ± 1, end 130 ± 1', () => {
    const { startFrame, endFrame } = findTrim(makeModel([...silence(30), ...steady(tone(1), 100), ...silence(50)], 220))
    expect(Math.abs(startFrame - 30)).toBeLessThanOrEqual(1)
    expect(Math.abs(endFrame - 130)).toBeLessThanOrEqual(1)
  })

  it('no silence -> start 0, end frameCount', () => {
    expect(findTrim(makeModel(steady(tone(1), 80), 220))).toEqual({ startFrame: 0, endFrame: 80 })
  })

  it('tail at -40 dB is kept, tail at -60 dB is trimmed', () => {
    const kept = findTrim(makeModel([...steady(tone(1), 50), ...steady(tone(db(-40)), 50)], 220))
    expect(kept.endFrame).toBe(100)
    const trimmed = findTrim(makeModel([...steady(tone(1), 50), ...steady(tone(db(-60)), 50)], 220))
    expect(trimmed.endFrame).toBe(50)
  })

  it('all-silent model -> start 0, end frameCount', () => {
    expect(findTrim(makeModel(silence(40), 220))).toEqual({ startFrame: 0, endFrame: 40 })
  })
})

describe('defaultRegions', () => {
  it('loop starts at the sustain frame and is DEFAULT_LOOP_FRAMES long, inside the trim', () => {
    const m = makeModel([...silence(30), ...steady(tone(1), 200), ...silence(20)], 220)
    const r = defaultRegions(m)
    const trim = findTrim(m)
    expect(r.startFrame).toBe(trim.startFrame)
    expect(r.endFrame).toBe(trim.endFrame)
    expect(r.loopStart).toBe(Math.min(Math.max(findSustainFrame(m), trim.startFrame), trim.endFrame - 1))
    expect(r.loopEnd).toBe(r.loopStart + DEFAULT_LOOP_FRAMES)
  })

  it('sound shorter than the default loop after the sustain frame -> loop ends at endFrame', () => {
    const r = defaultRegions(makeModel(steady(tone(1), 8), 220))
    expect(r.endFrame).toBe(8)
    expect(r.loopEnd).toBe(8)
    expect(r.loopStart).toBeLessThan(r.loopEnd)
  })

  it('one-frame model -> { 0, 0, 1, 1 }', () => {
    expect(defaultRegions(makeModel([tone(1)], 220))).toEqual({ startFrame: 0, loopStart: 0, loopEnd: 1, endFrame: 1 })
  })
})

describe('moveMarker', () => {
  const FRAMES = 100
  const base: PlayRegions = { startFrame: 10, loopStart: 30, loopEnd: 50, endFrame: 80 }
  // Lowest and highest frame each marker may take, given its neighbours in `base`.
  const limits: Record<MarkerName, [number, number]> = {
    startFrame: [0, 30],
    loopStart: [10, 49],
    loopEnd: [31, 80],
    endFrame: [50, FRAMES],
  }

  it.each(MARKER_ORDER)('%s moved inside its neighbours -> placed exactly', (marker) => {
    const [lo, hi] = limits[marker]
    const target = Math.round((lo + hi) / 2)
    expect(moveMarker(base, marker, target, FRAMES)[marker]).toBe(target)
  })

  it.each(MARKER_ORDER)('%s moved below its lower neighbour -> clamped to the limit', (marker) => {
    expect(moveMarker(base, marker, -500, FRAMES)[marker]).toBe(limits[marker][0])
  })

  it.each(MARKER_ORDER)('%s moved above its upper neighbour -> clamped to the limit', (marker) => {
    expect(moveMarker(base, marker, 500, FRAMES)[marker]).toBe(limits[marker][1])
  })

  it('loop never becomes empty: loopEnd onto loopStart -> loopStart + 1, loopStart onto loopEnd -> loopEnd − 1', () => {
    expect(moveMarker(base, 'loopEnd', 30, FRAMES).loopEnd).toBe(31)
    expect(moveMarker(base, 'loopStart', 50, FRAMES).loopStart).toBe(49)
  })

  it.each(MARKER_ORDER)('moving %s leaves the other three markers unchanged', (marker) => {
    const moved = moveMarker(base, marker, 40, FRAMES)
    for (const other of MARKER_ORDER) if (other !== marker) expect(moved[other]).toBe(base[other])
  })

  it('fractional frames are rounded to whole frames', () => {
    expect(moveMarker(base, 'loopEnd', 60.6, FRAMES).loopEnd).toBe(61)
  })
})

describe('assertRegions', () => {
  it('valid regions -> no throw', () => {
    expect(() => assertRegions({ startFrame: 0, loopStart: 0, loopEnd: 1, endFrame: 1 }, 1)).not.toThrow()
    expect(() => assertRegions({ startFrame: 10, loopStart: 30, loopEnd: 50, endFrame: 80 }, 100)).not.toThrow()
  })

  it.each<[string, PlayRegions]>([
    ['startFrame below 0', { startFrame: -1, loopStart: 30, loopEnd: 50, endFrame: 80 }],
    ['loopStart before startFrame', { startFrame: 40, loopStart: 30, loopEnd: 50, endFrame: 80 }],
    ['empty loop', { startFrame: 10, loopStart: 50, loopEnd: 50, endFrame: 80 }],
    ['loopEnd after endFrame', { startFrame: 10, loopStart: 30, loopEnd: 90, endFrame: 80 }],
    ['endFrame after frameCount', { startFrame: 10, loopStart: 30, loopEnd: 50, endFrame: 101 }],
    ['fractional marker', { startFrame: 10.5, loopStart: 30, loopEnd: 50, endFrame: 80 }],
  ])('%s -> RangeError', (_, regions) => {
    expect(() => assertRegions(regions, 100)).toThrow(RangeError)
  })
})
