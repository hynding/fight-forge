// Controllers turn a source of decisions (keyboard, AI) into a fighter Intent.

import type { Controls } from '../hooks/useControls'
import type { Intent, Vec2 } from './fighter'

/** Keyboard (or later gamepad) to Intent. Opposite keys: forward and left win, as before. */
export const inputIntent = (c: Controls): Intent => ({
  move: {
    x: c.left ? -1 : c.right ? 1 : 0,
    z: c.forward ? -1 : c.backward ? 1 : 0,
  },
  jump: c.jump,
  attack: c.attack,
  block: c.block,
  dodge: c.dodge,
})

export interface BrawlerConfig {
  aggroRange: number
  /** Horizontal reach: an enemy attacks when this close in X... */
  attackRange: number
  /** ...and this close in depth (Z), so it lines up with the player like a beat 'em up. */
  depthTolerance: number
  minSpacing: number
  crowdedThreshold: number
  avoidanceWeight: number
  circleSpeedFactor: number
  patrol: {
    retargetInterval: number
    minDistance: number
    maxDistance: number
    speedFactor: number
    arriveDistance: number
  }
}

/** What the AI can see this step. Positions are planar (X/Z). */
export interface BrawlerContext {
  self: Vec2
  target: Vec2
  /** Other enemies, for spacing. */
  others: Iterable<Vec2>
  /** True when someone else holds the attack slot. */
  slotTakenByOther: boolean
  /** Engage regardless of distance (e.g. the enemy is off screen, walking in or left behind). */
  forceEngage?: boolean
}

/** Per-enemy AI memory, kept between steps. */
export interface BrawlerMemory {
  patrolTarget: Vec2 | null
  patrolTimer: number
  /** Once engaged, an enemy keeps coming at the target instead of drifting back to patrol. */
  engaged: boolean
}

export const createBrawlerMemory = (): BrawlerMemory => ({
  patrolTarget: null,
  patrolTimer: 0,
  engaged: false,
})

const len = (v: Vec2) => Math.hypot(v.x, v.z)
const normalize = (v: Vec2): Vec2 => {
  const l = len(v)
  return l > 0 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 0 }
}
const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, z: v.z * s })

/** Push away from neighbours closer than `minSpacing`, stronger when closer. */
export const spacingPush = (self: Vec2, others: Iterable<Vec2>, minSpacing: number): Vec2 => {
  const push = { x: 0, z: 0 }
  for (const o of others) {
    const away = { x: self.x - o.x, z: self.z - o.z }
    const d = len(away)
    if (d < minSpacing && d > 0) {
      const n = scale(away, 1 / d)
      const w = (minSpacing - d) / minSpacing
      push.x += n.x * w
      push.z += n.z * w
    }
  }
  return push
}

// Where an enemy stands to attack, as a fraction of attackRange beside the target.
const STAND_OFF = 0.8

/**
 * The `brawler` behavior: inside aggro range, walk to a spot level with the
 * target in depth and just beside it (on the side the enemy is already on),
 * keeping spacing from other enemies. Lined up and in reach, circle if crowded
 * and someone else is attacking, otherwise stand and ask to attack (claim the
 * slot). Until it first comes within aggro range (or is forced to engage, as
 * off-screen enemies are), patrol to random nearby points; after that it stays
 * engaged. Always faces the target horizontally.
 *
 * `move` is the walk-speed fraction, so patrol and circling are slower.
 */
export const brawlerIntent = (
  ctx: BrawlerContext,
  mem: BrawlerMemory,
  cfg: BrawlerConfig,
  dt: number,
  random: () => number = Math.random
): Intent => {
  const toTarget = { x: ctx.target.x - ctx.self.x, z: ctx.target.z - ctx.self.z }
  const distance = len(toTarget)

  if (ctx.forceEngage || distance < cfg.aggroRange) mem.engaged = true

  if (mem.engaged) {
    const dir = normalize(toTarget)
    const face = { x: toTarget.x, z: 0 }
    const push = spacingPush(ctx.self, ctx.others, cfg.minSpacing)
    const crowded = len(push) > cfg.crowdedThreshold
    const inReach =
      Math.abs(toTarget.x) <= cfg.attackRange && Math.abs(toTarget.z) <= cfg.depthTolerance

    if (!inReach) {
      const side = ctx.self.x >= ctx.target.x ? 1 : -1
      const spot = { x: ctx.target.x + side * cfg.attackRange * STAND_OFF, z: ctx.target.z }
      let move = normalize({ x: spot.x - ctx.self.x, z: spot.z - ctx.self.z })
      if (crowded) {
        const p = scale(normalize(push), cfg.avoidanceWeight)
        const d = scale(move, 1 - cfg.avoidanceWeight)
        move = normalize({ x: p.x + d.x, z: p.z + d.z })
      }
      return { move, face, jump: false, attack: false }
    }

    if (crowded && ctx.slotTakenByOther) {
      // Circle sideways (perpendicular to the target direction) while waiting.
      const circle = scale({ x: -dir.z, z: dir.x }, cfg.circleSpeedFactor)
      return { move: circle, face, jump: false, attack: false }
    }

    return { move: { x: 0, z: 0 }, face, jump: false, attack: true }
  }

  // Patrol
  mem.patrolTimer += dt
  if (!mem.patrolTarget || mem.patrolTimer > cfg.patrol.retargetInterval) {
    const angle = random() * Math.PI * 2
    const d =
      cfg.patrol.minDistance + random() * (cfg.patrol.maxDistance - cfg.patrol.minDistance)
    mem.patrolTarget = { x: ctx.self.x + Math.cos(angle) * d, z: ctx.self.z + Math.sin(angle) * d }
    mem.patrolTimer = 0
  }

  const toPatrol = { x: mem.patrolTarget.x - ctx.self.x, z: mem.patrolTarget.z - ctx.self.z }
  if (len(toPatrol) > cfg.patrol.arriveDistance) {
    const dir = normalize(toPatrol)
    return { move: scale(dir, cfg.patrol.speedFactor), face: dir, jump: false, attack: false }
  }
  return { move: { x: 0, z: 0 }, jump: false, attack: false }
}
