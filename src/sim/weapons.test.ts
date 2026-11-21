import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { matchTrigger, type TriggerContext } from './moveset'
import { armedAttacks, holdWeapon, liftableInReach, walkFactor, weaponInReach, weaponMoveset, weaponPickupFor, wearWeapon } from './weapons'

const { weapons, pickups, props } = DEFAULT_CONFIG
const own = DEFAULT_CONFIG.player.moveset
const ground: TriggerContext = { air: false, running: false, blocking: false, direction: null, canPay: () => true }

describe('holding a weapon', () => {
  it('starts with full durability, or what a dropped one had left', () => {
    expect(holdWeapon('pipe', weapons.pipe)).toEqual({ id: 'pipe', durability: 12 })
    expect(holdWeapon('pipe', weapons.pipe, 3)).toEqual({ id: 'pipe', durability: 3 })
    expect(holdWeapon('barrel', weapons.barrel)).toEqual({ id: 'barrel', durability: null })
  })

  it('tries the weapon\'s rows first and falls through to the fighter\'s own', () => {
    const set = weaponMoveset(weapons.pipe, own)
    expect(set[matchTrigger(set, 'attack', ground)].move).toBe('pipeSwing')
    expect(set[matchTrigger(set, 'heavy', ground)].move).toBe('pipeSmash')
    expect(set[matchTrigger(set, 'special', ground)].move).toBe('shockwave')
    // The knife has no heavy row: the fighter's own heavy still works.
    const knife = weaponMoveset(weapons.knife, own)
    expect(knife[matchTrigger(knife, 'heavy', ground)].move).toBe('haymaker')
    expect(weaponMoveset(undefined, own)).toBe(own)
  })

  it('a heavy weapon replaces the moveset and slows walking', () => {
    const set = weaponMoveset(weapons.barrel, own)
    expect(matchTrigger(set, 'attack', ground)).toBe(-1)
    expect(walkFactor(weapons.barrel)).toBe(0.6)
    expect(walkFactor(weapons.pipe)).toBe(1)
    expect(walkFactor(undefined)).toBe(1)
  })

  it('wears down with each hit and breaks at zero; one without durability never breaks', () => {
    const held = holdWeapon('knife', weapons.knife, 2)
    expect(wearWeapon(held)).toBe(false)
    expect(wearWeapon(held)).toBe(true)
    expect(held.durability).toBe(0)
    const barrel = holdWeapon('barrel', weapons.barrel)
    expect(wearWeapon(barrel)).toBe(false)
  })
})

describe('armed enemies', () => {
  it('fight with the weapon\'s plain attack and heavy rows at near range', () => {
    expect(armedAttacks(weapons.pipe)).toEqual([
      { move: 'pipeSmash', range: 'near' },
      { move: 'pipeSwing', range: 'near' },
    ])
    expect(armedAttacks(weapons.barrel)).toBe(null)
  })
})

describe('finding weapons', () => {
  it('finds the pickup that puts a weapon on the floor', () => {
    expect(weaponPickupFor(pickups, 'pipe')).toBe('pipe')
    expect(weaponPickupFor(pickups, 'barrel')).toBe(null)
  })

  it('picks up the nearest weapon in reach, never other pickups', () => {
    const items = [
      { id: 'a', pickup: 'coin', x: 0, z: 0 },
      { id: 'b', pickup: 'knife', x: 0.5, z: 0 },
      { id: 'c', pickup: 'pipe', x: 0.2, z: 0 },
      { id: 'd', pickup: 'pipe', x: 5, z: 0 },
    ]
    expect(weaponInReach(items, pickups, { x: 0, z: 0 }, 0.8)?.id).toBe('c')
    expect(weaponInReach(items, pickups, { x: 3, z: 0 }, 0.8)).toBe(null)
  })

  it('lifts a liftable prop in front, within range and depth', () => {
    const placed = [
      { id: 'crate', prop: 'crate', x: 1, y: 0, z: 0, health: 10 },
      { id: 'behind', prop: 'barrel', x: -1, y: 0, z: 0, health: 16 },
      { id: 'front', prop: 'barrel', x: 1, y: 0, z: 0, health: 16 },
      { id: 'far', prop: 'barrel', x: 4, y: 0, z: 0, health: 16 },
    ]
    expect(liftableInReach(placed, props, { x: 0, z: 0 }, 1, 0.3, 0.5, 0.6)?.id).toBe('front')
    expect(liftableInReach(placed, props, { x: 0, z: 0 }, -1, 0.3, 0.5, 0.6)?.id).toBe('behind')
    expect(liftableInReach(placed, props, { x: 0, z: 2 }, 1, 0.3, 0.5, 0.6)).toBe(null)
  })
})
