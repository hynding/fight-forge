import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import { DEFAULT_CONFIG } from '../config/defaults'
import { brawlerIntent, createBrawlerMemory, inputIntent, spacingPush } from './controllers'
import type { Controls } from '../hooks/useControls'

const none: Controls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  attack: false,
  block: false,
  dodge: false,
}

describe('inputIntent', () => {
  it('maps WASD to move axes', () => {
    expect(inputIntent({ ...none, forward: true, right: true }).move).toEqual({ x: 1, z: -1 })
    expect(inputIntent({ ...none, backward: true, left: true }).move).toEqual({ x: -1, z: 1 })
  })

  it('passes jump and attack through', () => {
    const i = inputIntent({ ...none, jump: true, attack: true })
    expect(i.jump).toBe(true)
    expect(i.attack).toBe(true)
  })

  it('lets forward and left win over their opposites, as before', () => {
    expect(inputIntent({ ...none, forward: true, backward: true, left: true, right: true }).move).toEqual(
      { x: -1, z: -1 }
    )
  })
})

const AI = DEFAULT_CONFIG.enemy
const ctx = (self: { x: number; z: number }, others: { x: number; z: number }[] = [], taken = false) => ({
  self,
  target: { x: 0, z: 0 },
  others,
  slotTakenByOther: taken,
})

describe('brawlerIntent', () => {
  it('chases at full speed inside aggro range, facing the target', () => {
    const i = brawlerIntent(ctx({ x: 5, z: 0 }), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.move.x).toBeCloseTo(-1)
    expect(i.move.z).toBeCloseTo(0)
    expect(i.face?.x).toBeLessThan(0)
    expect(i.face?.z).toBe(0)
    expect(i.attack).toBe(false)
  })

  it('lines up in depth instead of attacking from above or below', () => {
    const i = brawlerIntent(ctx({ x: 0.2, z: 2 }), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.attack).toBe(false)
    // Heads for the spot beside the target: right (its side) and toward z = 0.
    expect(i.move.x).toBeGreaterThan(0)
    expect(i.move.z).toBeLessThan(0)
  })

  it('stands and asks to attack in attack range', () => {
    const i = brawlerIntent(ctx({ x: 1, z: 0 }), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.move).toEqual({ x: 0, z: 0 })
    expect(i.attack).toBe(true)
  })

  it('circles slowly when crowded and someone else holds the slot', () => {
    const i = brawlerIntent(ctx({ x: 1, z: 0 }, [{ x: 1, z: 0.5 }], true), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.attack).toBe(false)
    expect(Math.hypot(i.move.x, i.move.z)).toBeCloseTo(AI.circleSpeedFactor)
    // Perpendicular to the target direction.
    expect(i.move.x).toBeCloseTo(0)
  })

  it('still asks to attack when crowded but the slot is free', () => {
    const i = brawlerIntent(ctx({ x: 1, z: 0 }, [{ x: 1, z: 0.5 }], false), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.attack).toBe(true)
  })

  it('blends in the spacing push while chasing in a crowd', () => {
    const i = brawlerIntent(ctx({ x: 5, z: 0 }, [{ x: 5, z: -1 }]), createBrawlerMemory(), AI, SIM_STEP)
    expect(i.move.z).toBeGreaterThan(0) // pushed away from the neighbour at -z
    expect(Math.hypot(i.move.x, i.move.z)).toBeCloseTo(1)
  })

  it('patrols slowly toward a random point outside aggro range', () => {
    const mem = createBrawlerMemory()
    // random() = 0 -> angle 0, min distance: target is +x by minDistance.
    const i = brawlerIntent(ctx({ x: 50, z: 0 }), mem, AI, SIM_STEP, () => 0)
    expect(mem.patrolTarget).toEqual({ x: 50 + AI.patrol.minDistance, z: 0 })
    expect(i.move.x).toBeCloseTo(AI.patrol.speedFactor)
    expect(i.attack).toBe(false)
  })

  it('picks a new patrol point after the retarget interval', () => {
    const mem = createBrawlerMemory()
    let r = 0
    const random = () => r
    brawlerIntent(ctx({ x: 50, z: 0 }), mem, AI, SIM_STEP, random)
    const first = mem.patrolTarget
    r = 0.25
    const steps = Math.ceil(AI.patrol.retargetInterval / SIM_STEP) + 1
    for (let i = 0; i < steps; i++) brawlerIntent(ctx({ x: 50, z: 0 }), mem, AI, SIM_STEP, random)
    expect(mem.patrolTarget).not.toEqual(first)
  })
})

describe('spacingPush', () => {
  it('is zero with nobody close', () => {
    expect(spacingPush({ x: 0, z: 0 }, [{ x: 10, z: 0 }], 2.5)).toEqual({ x: 0, z: 0 })
  })

  it('pushes away, harder when closer', () => {
    const near = spacingPush({ x: 0, z: 0 }, [{ x: 0.5, z: 0 }], 2.5)
    const far = spacingPush({ x: 0, z: 0 }, [{ x: 2, z: 0 }], 2.5)
    expect(near.x).toBeLessThan(far.x)
    expect(far.x).toBeLessThan(0)
  })
})
