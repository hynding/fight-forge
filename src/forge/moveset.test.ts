import { describe, expect, it } from 'vitest'
import { actionFor, addRow, moveRow, PRESS_CHOICES, removeRow, setRow } from './moveset'
import type { Moveset } from '../sim/moveset'
import { unusedActions } from './fighter'
import { DEFAULT_CONFIG } from '../config/defaults'

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

describe('unusedActions', () => {
  const actions = DEFAULT_CONFIG.input.actions
  it('flags heavy and special when they are on but nothing uses them', () => {
    expect(unusedActions(set, {}, actions)).toEqual(['heavy', 'special'])
    expect(unusedActions(set, {}, { ...actions, special: { enabled: false } })).toEqual(['heavy'])
  })

  it('counts moveset rows, chords and move branches as uses', () => {
    const withRows: Moveset = [...set, { action: ['special', 'jump'], move: 'shockwave' }]
    expect(unusedActions(withRows, { jab: { branches: { heavy: 'haymaker' } } }, actions)).toEqual([])
    expect(unusedActions(DEFAULT_CONFIG.player.moveset, {}, actions)).toEqual([])
  })
})
