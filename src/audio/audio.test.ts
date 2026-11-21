import { describe, expect, it } from 'vitest'
import { noteFreq, parseNotes, patternSteps, stepSeconds } from './notes'
import { DEFAULT_VOLUMES, parseVolumes } from './volume'

describe('music notes', () => {
  it('names notes by pitch', () => {
    expect(noteFreq('A4')).toBe(440)
    expect(noteFreq('A3')).toBe(220)
    expect(noteFreq('C4')).toBeCloseTo(261.63, 2)
    expect(noteFreq('C#4')).toBeCloseTo(noteFreq('Db4')!, 6)
    expect(noteFreq('H2')).toBeNull()
    expect(noteFreq('.')).toBeNull()
  })

  it('reads rests and holds', () => {
    const { notes, steps } = parseNotes('A4 - - . C5 . - E5')
    expect(steps).toBe(8)
    expect(notes.map((n) => [n.step, n.steps])).toEqual([
      [0, 3],
      [4, 1],
      [7, 1],
    ])
  })

  it('times steps as sixteenth notes and loops on the longest track', () => {
    expect(stepSeconds(120)).toBe(0.125)
    expect(patternSteps([{ wave: 'sine', volume: 1, notes: 'A4 .' }, { wave: 'square', volume: 1, notes: 'A2 . . .' }])).toBe(4)
  })
})

describe('volume settings', () => {
  it('fills in and clamps stored values', () => {
    expect(parseVolumes(null)).toEqual(DEFAULT_VOLUMES)
    expect(parseVolumes({ master: 2, music: -1, sfx: 'loud' })).toEqual({ master: 1, music: 0, sfx: DEFAULT_VOLUMES.sfx })
  })
})
