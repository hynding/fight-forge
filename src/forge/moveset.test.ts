import { describe, expect, it } from 'vitest'
import { actionFor, addRow, moveRow, PRESS_CHOICES, removeRow, setRow } from './moveset'
import type { Moveset } from '../sim/moveset'

const set: Moveset = [
  { action: 'attack', when: 'air', move: 'jumpKick' },
  { action: 'attack', move: 'jab' },
]

describe('moveset editing', () => {
  it('offers single actions and pairs as chords', () => {
    expect(PRESS_CHOICES).toContain('attack')
    expect(PRESS_CHOICES).toContain('attack+jump')
    expect(actionFor('attack+jump')).toEqual(['attack', 'jump'])
    expect(actionFor('dodge')).toBe('dodge')
  })
  it('reorders, edits, adds and removes rows', () => {
    expect(moveRow(set, 1, -1).map((t) => t.move)).toEqual(['jab', 'jumpKick'])
    expect(moveRow(set, 0, -1)).toBe(set)
    expect(setRow(set, 0, { ...set[0], when: undefined })[0]).toEqual({ action: 'attack', move: 'jumpKick' })
    expect(addRow(set, 'hook')[0]).toEqual({ action: 'attack', direction: 'away', move: 'hook' })
    expect(removeRow(set, 0)).toHaveLength(1)
    expect(removeRow([set[0]], 0)).toHaveLength(1)
  })
})
