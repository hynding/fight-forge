import { describe, expect, it } from 'vitest'
import { combatTargets, scaledDamage, scaledHealth } from './rules'

describe('scaledDamage', () => {
  it('scales and rounds to whole points', () => {
    expect(scaledDamage(10, 1)).toBe(10)
    expect(scaledDamage(10, 1.5)).toBe(15)
    expect(scaledDamage(10, 0.25)).toBe(3)
  })

  it('never turns a damaging hit into nothing unless the multiplier is 0', () => {
    expect(scaledDamage(2, 0.1)).toBe(1)
    expect(scaledDamage(10, 0)).toBe(0)
    expect(scaledDamage(0, 2)).toBe(0)
  })
})

describe('scaledHealth', () => {
  it('scales enemy health, keeping at least 1', () => {
    expect(scaledHealth(50, 2)).toBe(100)
    expect(scaledHealth(50, 0.5)).toBe(25)
    expect(scaledHealth(1, 0.1)).toBe(1)
  })
})

describe('combatTargets', () => {
  const enemies = ['e1', 'e2', 'e3']

  it('lets the player hit every enemy', () => {
    expect(combatTargets('p1', ['p1'], enemies, false)).toEqual(enemies)
    expect(combatTargets('p1', ['p1'], enemies, true)).toEqual(enemies)
  })

  it("lets a player hit the other player only with co-op friendly fire", () => {
    expect(combatTargets('p1', [], enemies, false, ['p1', 'p2'])).toEqual([...enemies, 'p2'])
    expect(combatTargets('p2', [], enemies, false, [])).toEqual(enemies)
  })

  it('lets an enemy hit only the player without friendly fire', () => {
    expect(combatTargets('e2', ['p1'], enemies, false)).toEqual(['p1'])
  })

  it('lets an enemy hit the player and the other enemies with friendly fire', () => {
    expect(combatTargets('e2', ['p1'], enemies, true)).toEqual(['p1', 'e1', 'e3'])
  })
})
