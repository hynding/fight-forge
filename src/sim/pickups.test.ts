import { describe, expect, it } from 'vitest'
import { applyPickup, inPickupReach, rollDrop } from './pickups'

const FOOD = { effect: 'heal' as const, amount: 30, color: '#f80', size: 0.3 }
const COIN = { effect: 'score' as const, amount: 500, color: '#fd0', size: 0.25 }

describe('pickups', () => {
  it('is collected within the radius on the ground plane', () => {
    expect(inPickupReach({ x: 0, z: 0 }, { x: 0.5, z: 0.5 }, 0.8)).toBe(true)
    expect(inPickupReach({ x: 0, z: 0 }, { x: 1, z: 0.5 }, 0.8)).toBe(false)
  })

  it('heals up to max health, or adds score', () => {
    const s = { playerHealth: 90, playerMaxHealth: 100, score: 10 }
    expect(applyPickup(s, FOOD)).toEqual({ playerHealth: 100 })
    expect(applyPickup(s, COIN)).toEqual({ score: 510 })
  })

  it('drops by chance', () => {
    const drop = { pickup: 'food', chance: 0.25 }
    expect(rollDrop(drop, () => 0.1)).toBe('food')
    expect(rollDrop(drop, () => 0.3)).toBeNull()
    expect(rollDrop(undefined, () => 0)).toBeNull()
  })
})
