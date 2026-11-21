import { describe, expect, it } from 'vitest'
import { boxesOverlap } from './combat'
import {
  createProjectileWorld,
  flightPath,
  launchProjectile,
  projectileBox,
  projectileTargets,
  registerHit,
  stepProjectile,
  type ProjectileDef,
} from './projectiles'

const STEP = 1 / 60
const knife: ProjectileDef = {
  shape: 'box',
  size: [0.5, 0.08, 0.08],
  color: '#c0c8d0',
  speed: 12,
  lift: 0,
  gravity: 0,
  hitbox: { halfX: 0.25, halfY: 0.15, halfZ: 0.3 },
  damage: 10,
  reaction: { hitstun: 0.3, knockback: { x: 3, y: 0 } },
  lifetime: 1,
}
const barrel: ProjectileDef = { ...knife, shape: 'cylinder', speed: 8, lift: 5, gravity: 20, lifetime: 3, hitbox: { halfX: 0.4, halfY: 0.4, halfZ: 0.5 } }
const bounds = { minX: 0, maxX: 100, floorY: 0 }
const shooter = (over: Partial<Parameters<typeof launchProjectile>[4]> = {}) => ({
  owner: 'player',
  origin: { x: 10, y: 1, z: -1 },
  facingX: 1,
  scale: 1,
  hurtsPlayer: false,
  ...over,
})

describe('launchProjectile', () => {
  it('starts in front of the shooter, along its facing, scaled', () => {
    const w = createProjectileWorld()
    const p = launchProjectile(w, 'knife', knife, { id: 'knife', from: [0.5, 0.2] }, shooter({ facingX: -1, scale: 2 }))
    expect(p).toMatchObject({ x: 9, y: 1.4, z: -1, vx: -12, vy: 0, dirX: -1, key: 1 })
    expect(w.list).toEqual([p])
    expect(launchProjectile(w, 'knife', knife, { id: 'knife', from: [0, 0] }, shooter()).key).toBe(2)
  })
})

describe('stepProjectile', () => {
  it('flies straight without gravity until its lifetime runs out', () => {
    const p = launchProjectile(createProjectileWorld(), 'knife', knife, { id: 'knife', from: [0, 0] }, shooter())
    let steps = 0
    let r = 'flying'
    while (r === 'flying') {
      r = stepProjectile(p, knife, STEP, bounds)
      steps++
    }
    expect(r).toBe('expired')
    expect(steps).toBe(60)
    expect(p.y).toBe(1)
    expect(p.x).toBeCloseTo(22)
  })

  it('arcs up and lands with gravity', () => {
    const p = launchProjectile(createProjectileWorld(), 'barrel', barrel, { id: 'barrel', from: [0, 0] }, shooter())
    let top = p.y
    let r = 'flying'
    while (r === 'flying') {
      r = stepProjectile(p, barrel, STEP, bounds)
      top = Math.max(top, p.y)
    }
    expect(r).toBe('landed')
    expect(top).toBeGreaterThan(1.5)
    expect(p.y - barrel.hitbox.halfY).toBeLessThanOrEqual(0)
  })

  it('is gone when it leaves the stage', () => {
    const p = launchProjectile(createProjectileWorld(), 'knife', knife, { id: 'knife', from: [0, 0] }, shooter({ origin: { x: 0.1, y: 1, z: 0 }, facingX: -1 }))
    expect(stepProjectile(p, knife, STEP, bounds)).toBe('left')
  })
})

describe('hits', () => {
  it('hits with its box', () => {
    const p = launchProjectile(createProjectileWorld(), 'knife', knife, { id: 'knife', from: [0, 0] }, shooter())
    const hurt = { half: { x: 0.4, y: 0.9, z: 0.3 } }
    expect(boxesOverlap(projectileBox(p, knife), { center: { x: 10.5, y: 1, z: -1 }, ...hurt })).toBe(true)
    expect(boxesOverlap(projectileBox(p, knife), { center: { x: 10.5, y: 1, z: 0 }, ...hurt })).toBe(false)
  })

  it('stops at the first hit, or flies through `pierce` more', () => {
    const w = createProjectileWorld()
    const p = launchProjectile(w, 'knife', knife, { id: 'knife', from: [0, 0] }, shooter())
    expect(registerHit(p, 'e1')).toBe(true)
    const q = launchProjectile(w, 'knife', { ...knife, pierce: 2 }, { id: 'knife', from: [0, 0] }, shooter())
    expect([registerHit(q, 'e1'), registerHit(q, 'e2'), registerHit(q, 'e3')]).toEqual([false, false, true])
    expect([...q.hit]).toEqual(['e1', 'e2', 'e3'])
  })

  it("aims the player's at enemies and an enemy's at the player only with permission", () => {
    const w = createProjectileWorld()
    const mine = launchProjectile(w, 'knife', knife, { id: 'knife', from: [0, 0] }, shooter())
    expect(projectileTargets(mine, 'player', ['e1', 'e2'], false)).toEqual(['e1', 'e2'])
    const theirs = launchProjectile(w, 'knife', knife, { id: 'knife', from: [0, 0] }, shooter({ owner: 'e1', hurtsPlayer: true }))
    expect(projectileTargets(theirs, 'player', ['e1', 'e2'], false)).toEqual(['player'])
    expect(projectileTargets(theirs, 'player', ['e1', 'e2'], true)).toEqual(['player', 'e2'])
    const waiting = launchProjectile(w, 'knife', knife, { id: 'knife', from: [0, 0] }, shooter({ owner: 'e2' }))
    expect(projectileTargets(waiting, 'player', ['e1', 'e2'], true)).toEqual([])
  })
})

describe('flightPath', () => {
  it('measures a straight throw', () => {
    const f = flightPath(knife, 1)
    expect(f.end).toBe('expired')
    expect(f.time).toBeCloseTo(1)
    expect(f.range).toBeCloseTo(12)
    expect(f.apex).toBe(0)
  })

  it('measures an arc that lands', () => {
    const f = flightPath(barrel, 1)
    expect(f.end).toBe('landed')
    // Apex of v²/2g = 25/40.
    expect(f.apex).toBeCloseTo(0.625, 1)
    expect(f.range).toBeGreaterThan(4)
    expect(f.points[0]).toEqual({ t: 0, x: 0, y: 0 })
  })
})
