import { describe, expect, it } from 'vitest'
import { boxesOverlap, hitboxWorld, knockbackDirection } from './combat'

const HB = { forward: 1, up: 0, halfX: 0.5, halfY: 0.5, halfZ: 0.5 }
const hurt = (x: number, z = 0, y = 0) => ({ center: { x, y, z }, half: { x: 0.25, y: 1, z: 0.25 } })
const origin = { x: 0, y: 0, z: 0 }

describe('hitboxWorld', () => {
  it('sits in front of the attacker on the side it faces, scaled', () => {
    expect(hitboxWorld(origin, 1, HB, 1).center.x).toBe(1)
    expect(hitboxWorld(origin, -1, HB, 1).center.x).toBe(-1)
    const big = hitboxWorld(origin, 1, HB, 2)
    expect(big.center.x).toBe(2)
    expect(big.half.x).toBe(1)
  })
})

describe('boxesOverlap', () => {
  const hb = hitboxWorld(origin, 1, HB, 1)

  it('hits a target in front within reach', () => {
    expect(boxesOverlap(hb, hurt(1.5))).toBe(true)
  })

  it('misses behind, out of reach, or off in depth', () => {
    expect(boxesOverlap(hb, hurt(-1))).toBe(false)
    expect(boxesOverlap(hb, hurt(1.8))).toBe(false)
    expect(boxesOverlap(hb, hurt(1, 0.8))).toBe(false)
  })

  it('misses a target far above (e.g. mid-jump over the hitbox)', () => {
    expect(boxesOverlap(hb, hurt(1, 0, 2))).toBe(false)
  })
})

describe('knockbackDirection', () => {
  it('pushes away from the attacker, or along its facing when level', () => {
    expect(knockbackDirection(0, 1, -1)).toBe(1)
    expect(knockbackDirection(0, -1, 1)).toBe(-1)
    expect(knockbackDirection(0, 0, -1)).toBe(-1)
  })
})
