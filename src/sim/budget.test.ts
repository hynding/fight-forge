import { describe, expect, it } from 'vitest'
import { assignDetail, createModelBudget, fullDetail, registerModel, unregisterModel } from './budget'

describe('model detail budget', () => {
  it('keeps the player and the nearest fighters at full detail', () => {
    const full = fullDetail(
      [
        { name: 'far', distance: 20 },
        { name: 'near', distance: 1 },
        { name: 'player', distance: 0 },
        { name: 'mid', distance: 5 },
      ],
      3
    )
    expect([...full].sort()).toEqual(['mid', 'near', 'player'])
    expect(fullDetail([{ name: 'a', distance: 1 }, { name: 'player', distance: 9 }], 1)).toEqual(new Set(['player']))
  })

  it('assigns detail to registered models and forgets removed ones', () => {
    const b = createModelBudget()
    const p = registerModel(b, 'player')
    const near = registerModel(b, 'e1')
    const far = registerModel(b, 'e2')
    const dist: Record<string, number> = { player: 0, e1: 2, e2: 9 }
    assignDetail(b, (n) => dist[n] ?? null, 2)
    expect([b.detail.get(p), b.detail.get(near), b.detail.get(far)]).toEqual(['full', 'full', 'reduced'])
    unregisterModel(b, near)
    assignDetail(b, (n) => dist[n] ?? null, 2)
    expect(b.detail.get(far)).toBe('full')
    expect(b.detail.has(near)).toBe(false)
  })
})
