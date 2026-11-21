import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import { DEFAULT_CONFIG } from '../config/defaults'
import {
  approachSpot,
  attackRangeAt,
  createBrawlerMemory,
  enemyIntent,
  inAttackPosition,
  inputIntent,
  spacingPush,
} from './controllers'
import type { Controls } from './actions'

const none: Controls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  attack: false,
  block: false,
  dodge: false,
  heavy: false,
  special: false,
  run: false,
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
const { brawler: BRAWLER, rusher: RUSHER, flanker: FLANKER } = DEFAULT_CONFIG.ai
const ctx = (self: { x: number; z: number }, others: { x: number; z: number }[] = [], taken = false) => ({
  self,
  target: { x: 0, z: 0 },
  others,
  tokensTaken: taken,
})

describe('enemyIntent (brawler)', () => {
  it('chases at full speed inside aggro range, facing the target', () => {
    const i = enemyIntent(ctx({ x: 5, z: 0 }), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.move.x).toBeCloseTo(-1)
    expect(i.move.z).toBeCloseTo(0)
    expect(i.face?.x).toBeLessThan(0)
    expect(i.face?.z).toBe(0)
    expect(i.attack).toBe(false)
  })

  it('lines up in depth instead of attacking from above or below', () => {
    const i = enemyIntent(ctx({ x: 0.2, z: 2 }), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.attack).toBe(false)
    // Heads for the spot beside the target: right (its side) and toward z = 0.
    expect(i.move.x).toBeGreaterThan(0)
    expect(i.move.z).toBeLessThan(0)
  })

  it('stands and asks to attack in attack range', () => {
    const i = enemyIntent(ctx({ x: 1, z: 0 }), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.move).toEqual({ x: 0, z: 0 })
    expect(i.attack).toBe(true)
  })

  it('circles slowly when crowded and every token is taken', () => {
    const i = enemyIntent(ctx({ x: 1, z: 0 }, [{ x: 1, z: 0.5 }], true), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.attack).toBe(false)
    expect(Math.hypot(i.move.x, i.move.z)).toBeCloseTo(AI.circleSpeedFactor)
    // Perpendicular to the target direction.
    expect(i.move.x).toBeCloseTo(0)
  })

  it('still asks to attack when crowded but a token is free', () => {
    const i = enemyIntent(ctx({ x: 1, z: 0 }, [{ x: 1, z: 0.5 }], false), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.attack).toBe(true)
  })

  it('blends in the spacing push while chasing in a crowd', () => {
    const i = enemyIntent(ctx({ x: 5, z: 0 }, [{ x: 5, z: -1 }]), createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.move.z).toBeGreaterThan(0) // pushed away from the neighbour at -z
    expect(Math.hypot(i.move.x, i.move.z)).toBeCloseTo(1)
  })

  it('patrols slowly toward a random point outside aggro range', () => {
    const mem = createBrawlerMemory()
    // random() = 0 -> angle 0, min distance: target is +x by minDistance.
    const i = enemyIntent(ctx({ x: 50, z: 0 }), mem, AI, BRAWLER, SIM_STEP, () => 0)
    expect(mem.patrolTarget).toEqual({ x: 50 + AI.patrol.minDistance, z: 0 })
    expect(i.move.x).toBeCloseTo(AI.patrol.speedFactor)
    expect(i.attack).toBe(false)
  })

  it('picks a new patrol point after the retarget interval', () => {
    const mem = createBrawlerMemory()
    let r = 0
    const random = () => r
    enemyIntent(ctx({ x: 50, z: 0 }), mem, AI, BRAWLER, SIM_STEP, random)
    const first = mem.patrolTarget
    r = 0.25
    const steps = Math.ceil(AI.patrol.retargetInterval / SIM_STEP) + 1
    for (let i = 0; i < steps; i++) enemyIntent(ctx({ x: 50, z: 0 }), mem, AI, BRAWLER, SIM_STEP, random)
    expect(mem.patrolTarget).not.toEqual(first)
  })

  it('chases from any distance when forced to engage (off screen)', () => {
    const i = enemyIntent({ ...ctx({ x: 50, z: 0 }), forceEngage: true }, createBrawlerMemory(), AI, BRAWLER, SIM_STEP)
    expect(i.move.x).toBeLessThan(-0.9)
  })

  it('stays engaged after leaving aggro range', () => {
    const mem = createBrawlerMemory()
    enemyIntent(ctx({ x: 5, z: 0 }), mem, AI, BRAWLER, SIM_STEP)
    const i = enemyIntent(ctx({ x: 50, z: 0 }), mem, AI, BRAWLER, SIM_STEP, () => 0)
    expect(mem.engaged).toBe(true)
    expect(mem.patrolTarget).toBeNull()
    expect(i.move.x).toBeLessThan(-0.9)
  })
})

describe('archetypes', () => {
  it('rusher: attacks from its long reach, standing well back', () => {
    const far = { ...ctx({ x: RUSHER.reach - 0.2, z: 0 }) }
    expect(enemyIntent(far, createBrawlerMemory(), AI, RUSHER, SIM_STEP).attack).toBe(true)
    expect(enemyIntent(far, createBrawlerMemory(), AI, BRAWLER, SIM_STEP).attack).toBe(false)
    expect(approachSpot(ctx({ x: 10, z: 0 }), RUSHER).x).toBeCloseTo(RUSHER.reach * RUSHER.standOff)
  })

  it("beside: takes the other side when a closer enemy has this side's spot", () => {
    // Target at 0; spot on the right is x = 1.2. A neighbour already stands there.
    const spot = approachSpot(ctx({ x: 3, z: 1 }, [{ x: 1.3, z: 0.1 }]), BRAWLER)
    expect(spot.x).toBeCloseTo(-BRAWLER.reach * BRAWLER.standOff)
    // A farther neighbour doesn't take it.
    expect(approachSpot(ctx({ x: 1.4, z: 0 }, [{ x: 2.5, z: 1 }]), BRAWLER).x).toBeGreaterThan(0)
  })

  it('flanker: heads behind the target, detouring in depth from the front', () => {
    // Target at 0 facing +x; flanker in front at x = 1.
    const front = { ...ctx({ x: 1, z: 0.2 }), targetFacingX: 1 }
    const spot = approachSpot(front, FLANKER)
    expect(spot.x).toBeLessThan(0)
    expect(Math.abs(spot.z)).toBeGreaterThan(1)
    expect(inAttackPosition(front, AI, FLANKER)).toBe(false)
    expect(enemyIntent(front, createBrawlerMemory(), AI, FLANKER, SIM_STEP).attack).toBe(false)
  })

  it('flanker: attacks once behind', () => {
    const behind = { ...ctx({ x: -1, z: 0 }), targetFacingX: 1 }
    expect(enemyIntent(behind, createBrawlerMemory(), AI, FLANKER, SIM_STEP).attack).toBe(true)
    // The target turning around puts it in front again.
    expect(inAttackPosition({ ...behind, targetFacingX: -1 }, AI, FLANKER)).toBe(false)
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

describe('far attacks', () => {
  const fighting = () => ({ ...createBrawlerMemory(), engaged: true })

  it('attacks from far reach only when a far attack is ready', () => {
    const at = ctx({ x: 4, z: 0 })
    expect(enemyIntent({ ...at, farAttack: true }, fighting(), AI, BRAWLER, SIM_STEP).attack).toBe(true)
    expect(enemyIntent(at, fighting(), AI, BRAWLER, SIM_STEP).attack).toBe(false)
    // Beyond far reach, or someone else has the token: walk in.
    expect(enemyIntent({ ...ctx({ x: 9, z: 0 }), farAttack: true }, fighting(), AI, BRAWLER, SIM_STEP).attack).toBe(false)
    expect(enemyIntent({ ...ctx({ x: 4, z: 0 }, [], true), farAttack: true }, fighting(), AI, BRAWLER, SIM_STEP).attack).toBe(false)
  })

  it('tells near from far, and an archetype without farReach has no far band', () => {
    expect(attackRangeAt(ctx({ x: 1, z: 0 }), AI, BRAWLER)).toBe('near')
    expect(attackRangeAt(ctx({ x: 4, z: 0 }), AI, BRAWLER)).toBe('far')
    expect(attackRangeAt(ctx({ x: 4, z: 2 }), AI, BRAWLER)).toBe(null)
    expect(attackRangeAt(ctx({ x: 4, z: 0 }), AI, { ...BRAWLER, farReach: undefined })).toBe(null)
  })
})
