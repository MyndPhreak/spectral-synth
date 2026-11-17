import { describe, expect, it } from 'vitest'
import { clampOctave, keyToNote } from '../src/input/keyboard'

const OCTAVE_4: [string, number][] = [
  ['KeyA', 60], ['KeyW', 61], ['KeyS', 62], ['KeyE', 63], ['KeyD', 64], ['KeyF', 65], ['KeyT', 66],
  ['KeyG', 67], ['KeyY', 68], ['KeyH', 69], ['KeyU', 70], ['KeyJ', 71], ['KeyK', 72], ['KeyO', 73],
  ['KeyL', 74], ['KeyP', 75], ['Semicolon', 76],
]

describe('keyToNote', () => {
  it.each(OCTAVE_4)('%s at octave 4 -> %i', (code, note) => {
    expect(keyToNote(code, 4)).toBe(note)
  })

  it('octave 5 -> the same keys one octave (12 notes) higher', () => {
    for (const [code, note] of OCTAVE_4) expect(keyToNote(code, 5)).toBe(note + 12)
  })

  it('octave 0 -> KeyA is C-1, MIDI note 12', () => {
    expect(keyToNote('KeyA', 0)).toBe(12)
  })

  it.each(['KeyQ', 'Space', 'KeyZ', 'KeyX', 'Digit1', ''])('unmapped code %j -> null', (code) => {
    expect(keyToNote(code, 4)).toBeNull()
  })

  it('note above 127 -> null (octave 8 upper keys)', () => {
    // Octave 8: KeyA = 108, KeyH = 117, Semicolon = 124; octave 9 would pass 127.
    expect(keyToNote('Semicolon', 8)).toBe(124)
    expect(keyToNote('KeyA', 9)).toBe(120)
    expect(keyToNote('KeyO', 9)).toBeNull()
  })
})

describe('clampOctave', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [4, 4],
    [8, 8],
    [9, 8],
  ])('%i -> %i', (input, expected) => {
    expect(clampOctave(input)).toBe(expected)
  })
})
