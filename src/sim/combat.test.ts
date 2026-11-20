import { describe, expect, it } from 'vitest'
import { enemyCanHitPlayer, isInAttackCone } from './combat'

const CONE = { range: 3, cone: 0.5 }
const origin = { x: 0, y: 0, z: 0 }
const north = { x: 0, y: 0, z: -1 }

describe('isInAttackCone', () => {
  it('hits a target in front and in range', () => {
    expect(isInAttackCone(origin, north, { x: 0, y: 0, z: -2 }, CONE)).toBe(true)
  })

  it('misses a target out of range', () => {
    expect(isInAttackCone(origin, north, { x: 0, y: 0, z: -3 }, CONE)).toBe(false)
  })

  it('misses a target behind or beside', () => {
    expect(isInAttackCone(origin, north, { x: 0, y: 0, z: 2 }, CONE)).toBe(false)
    expect(isInAttackCone(origin, north, { x: 2, y: 0, z: 0 }, CONE)).toBe(false)
  })

  it('hits inside the 60 degree half-angle but not outside it', () => {
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180
      return { x: Math.sin(r) * 2, y: 0, z: -Math.cos(r) * 2 }
    }
    expect(isInAttackCone(origin, north, at(55), CONE)).toBe(true)
    expect(isInAttackCone(origin, north, at(65), CONE)).toBe(false)
  })

  it('misses a target at the exact same spot', () => {
    expect(isInAttackCone(origin, north, origin, CONE)).toBe(false)
  })
})

describe('enemyCanHitPlayer', () => {
  const cfg = { hitRange: 2, damageCooldown: 1 }
  const near = { x: 1, y: 0, z: 0 }

  it('hits in range with no previous hit', () => {
    expect(enemyCanHitPlayer(near, origin, 0, undefined, cfg)).toBe(true)
  })

  it('respects the per-enemy cooldown', () => {
    expect(enemyCanHitPlayer(near, origin, 0.5, 0, cfg)).toBe(false)
    expect(enemyCanHitPlayer(near, origin, 1.01, 0, cfg)).toBe(true)
  })

  it('misses out of range', () => {
    expect(enemyCanHitPlayer({ x: 3, y: 0, z: 0 }, origin, 0, undefined, cfg)).toBe(false)
  })
})
