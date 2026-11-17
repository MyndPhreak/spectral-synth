import { describe, expect, it } from 'vitest'
import { hzToNote, noteName } from '../src/audio/notes'

describe('notes', () => {
  it.each([
    [60, 'C4'],
    [57, 'A3'],
    [61, 'C♯4'],
    [12, 'C0'],
    [0, 'C-1'],
    [127, 'G9'],
  ])('noteName(%i) -> %s', (note, name) => {
    expect(noteName(note)).toBe(name)
  })

  it.each([
    [440, 69],
    [220, 57],
    [261.63, 60],
    [226, 57], // +46 cents rounds down
    [227, 58], // +50.7 cents rounds up
  ])('hzToNote(%f) -> %i', (hz, note) => {
    expect(hzToNote(hz)).toBe(note)
  })
})
