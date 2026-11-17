import { describe, expect, it } from 'vitest'
import { findPeaks, type Peak } from '../src/audio/peaks'
import { assignHarmonics, trackPeaks } from '../src/audio/partials'
import { sawtooth, SR } from './signals'

describe('assignHarmonics', () => {
  const sawPeaks = findPeaks(sawtooth(220, 0.1).subarray(0, 2048), SR)
  const { amp, ratio } = assignHarmonics(sawPeaks, 220, 220, 16)

  it('220 Hz sawtooth -> harmonic k amp ≈ 1/k of harmonic 1, within 5 %, for k = 1..10', () => {
    for (let k = 1; k <= 10; k++) {
      const relative = amp[k - 1] / amp[0]
      expect(Math.abs(relative - 1 / k) / (1 / k)).toBeLessThanOrEqual(0.05)
    }
  })

  it('220 Hz sawtooth -> ratio within 0.5 % of k', () => {
    for (let k = 1; k <= 10; k++) expect(Math.abs(ratio[k - 1] - k) / k).toBeLessThanOrEqual(0.005)
  })

  it('ratio is relative to rootHz, not f0', () => {
    const r = assignHarmonics([{ hz: 440, amp: 1 }], 440, 220, 1).ratio
    expect(r[0]).toBeCloseTo(2, 9)
  })

  it('missing harmonic 3 -> amp 0 and ratio 0 in slot 2', () => {
    const peaks: Peak[] = [1, 2, 4].map((k) => ({ hz: 100 * k, amp: 1 / k }))
    const h = assignHarmonics(peaks, 100, 100, 4)
    expect(h.amp[2]).toBe(0)
    expect(h.ratio[2]).toBe(0)
    expect(h.amp[3]).toBeCloseTo(0.25, 9)
  })

  it('peak 10 % off a harmonic, tolerance 3 % -> not assigned', () => {
    const h = assignHarmonics([{ hz: 220, amp: 1 }], 200, 200, 2, 0.03)
    expect(Array.from(h.amp)).toEqual([0, 0])
  })

  it('two peaks near one harmonic -> the strongest wins', () => {
    const h = assignHarmonics(
      [
        { hz: 101, amp: 0.9 },
        { hz: 99, amp: 0.3 },
      ],
      100,
      100,
      1,
    )
    expect(h.amp[0]).toBeCloseTo(0.9, 6)
    expect(h.ratio[0]).toBeCloseTo(1.01, 6)
  })

  it('f0 0 (unvoiced frame) -> all slots silent', () => {
    const h = assignHarmonics([{ hz: 100, amp: 1 }], 0, 100, 3)
    expect(Array.from(h.amp)).toEqual([0, 0, 0])
    expect(Array.from(h.ratio)).toEqual([0, 0, 0])
  })
})

describe('trackPeaks', () => {
  const root = 261.63
  const at = (t: ReturnType<typeof trackPeaks>, frame: number, slot: number) => ({
    amp: t.amp[frame * t.partialCount + slot],
    ratio: t.ratio[frame * t.partialCount + slot],
  })

  it('steady 300 + 770 Hz -> 2 partials, each peak keeps its slot, ratio = hz / rootHz', () => {
    const frames: Peak[][] = Array.from({ length: 5 }, (_, i) =>
      // Swap the amp order on odd frames so a sort-order bug would swap slots.
      i % 2
        ? [
            { hz: 770, amp: 0.6 },
            { hz: 300, amp: 0.5 },
          ]
        : [
            { hz: 300, amp: 0.6 },
            { hz: 770, amp: 0.5 },
          ],
    )
    const t = trackPeaks(frames, root, 8)
    expect(t.partialCount).toBe(2)
    expect(t.amp.length).toBe(5 * 2)
    const slot300 = Math.abs(at(t, 0, 0).ratio * root - 300) < 1 ? 0 : 1
    for (let f = 0; f < 5; f++) {
      expect(at(t, f, slot300).ratio).toBeCloseTo(300 / root, 6)
      expect(at(t, f, 1 - slot300).ratio).toBeCloseTo(770 / root, 6)
    }
  })

  it('slowly gliding peak (1 % per frame) stays in one slot', () => {
    const frames: Peak[][] = Array.from({ length: 10 }, (_, i) => [{ hz: 400 * 1.01 ** i, amp: 1 }])
    expect(trackPeaks(frames, root, 8).partialCount).toBe(1)
  })

  it('peak that starts mid-sound -> new slot, amp 0 before its start', () => {
    const frames: Peak[][] = [[{ hz: 300, amp: 1 }], [{ hz: 300, amp: 1 }], [{ hz: 300, amp: 1 }, { hz: 900, amp: 0.5 }]]
    const t = trackPeaks(frames, root, 8)
    expect(t.partialCount).toBe(2)
    expect(at(t, 0, 1)).toEqual({ amp: 0, ratio: 0 })
    expect(at(t, 1, 1)).toEqual({ amp: 0, ratio: 0 })
    expect(at(t, 2, 1).amp).toBeCloseTo(0.5, 6)
  })

  it('peak that ends -> amp 0 and ratio 0 after its end', () => {
    const frames: Peak[][] = [[{ hz: 300, amp: 1 }, { hz: 900, amp: 0.5 }], [{ hz: 300, amp: 1 }], [{ hz: 300, amp: 1 }]]
    const t = trackPeaks(frames, root, 8)
    expect(at(t, 1, 1)).toEqual({ amp: 0, ratio: 0 })
    expect(at(t, 2, 1)).toEqual({ amp: 0, ratio: 0 })
  })

  it('more distinct peaks than maxPartials -> partialCount is maxPartials and the weakest are dropped', () => {
    const peaks: Peak[] = Array.from({ length: 6 }, (_, i) => ({ hz: 200 * (i + 1), amp: 1 - i * 0.1 }))
    const t = trackPeaks([peaks, peaks], root, 4)
    expect(t.partialCount).toBe(4)
    const kept = Array.from({ length: 4 }, (_, s) => Math.round(at(t, 0, s).ratio * root)).sort((a, b) => a - b)
    expect(kept).toEqual([200, 400, 600, 800])
  })

  it('no frames -> no partials', () => {
    const t = trackPeaks([], root, 8)
    expect(t.partialCount).toBe(0)
    expect(t.amp.length).toBe(0)
  })
})
