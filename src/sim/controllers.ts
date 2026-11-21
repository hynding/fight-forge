// Controllers turn a source of decisions (keyboard, AI) into a fighter Intent.

import type { Controls } from './actions'
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

/** Shared enemy AI tuning (the content's `enemy` settings, aggro scaled per type). */
export interface BrawlerConfig {
  aggroRange: number
  /** An enemy attacks only when this close to the player in depth (Z), lined up like a beat 'em up. */
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

/**
 * One archetype's strategy, as data. `approach` picks where the enemy stands:
 * `beside` the target on the side it's already on, or `behind` the target
 * (detouring around it in depth). `reach` is how close in X it must be to
 * attack, `standOff` the fraction of reach it stands at, and `attackFrom`
 * whether it attacks from any side or only from behind.
 */
export interface AiBehavior {
  approach: 'beside' | 'behind'
  reach: number
  standOff: number
  attackFrom: 'any' | 'behind'
  /** How far in X a `far` attack (a charge) can start from; without it the type only attacks within `reach`. */
  farReach?: number
}

/** What the AI can see this step. Positions are planar (X/Z). */
export interface BrawlerContext {
  self: Vec2
  target: Vec2
  /** Which way the target faces (±1); flankers go behind it. */
  targetFacingX?: number
  /** Other enemies, for spacing. */
  others: Iterable<Vec2>
  /** True when every attack token is held by other enemies. */
  tokensTaken: boolean
  /** Engage regardless of distance (e.g. the enemy is off screen, walking in or left behind). */
  forceEngage?: boolean
  /** A `far` attack is ready: the enemy may attack from `farReach` instead of walking in. */
  farAttack?: boolean
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

// Another enemy this close to a spot (and closer than us) has it.
const SPOT_TAKEN = 1.5

// How far a flanker swings out in depth to get around the target.
const FLANK_DETOUR = 1.6

/** Where the enemy wants to stand to attack, by its approach strategy. */
export const approachSpot = (ctx: BrawlerContext, behavior: AiBehavior): Vec2 => {
  const distance = behavior.reach * behavior.standOff
  const sideNow = ctx.self.x >= ctx.target.x ? 1 : -1
  if (behavior.approach === 'beside') {
    const mine = { x: ctx.target.x + sideNow * distance, z: ctx.target.z }
    // Someone closer already has this side's spot: take the other side, so
    // two enemies don't push each other off the line forever.
    const myDist = Math.hypot(mine.x - ctx.self.x, mine.z - ctx.self.z)
    for (const o of ctx.others) {
      const d = Math.hypot(mine.x - o.x, mine.z - o.z)
      if (d < myDist && d < SPOT_TAKEN) return { x: ctx.target.x - sideNow * distance, z: ctx.target.z }
    }
    return mine
  }
  // Behind: the side the target faces away from.
  const back = -(ctx.targetFacingX ?? 1)
  const spot = { x: ctx.target.x + back * distance, z: ctx.target.z }
  // On the wrong side and close: swing out in depth to get around it.
  if (sideNow !== back && Math.abs(ctx.self.x - ctx.target.x) < behavior.reach * 2) {
    spot.z += (ctx.self.z <= ctx.target.z ? -1 : 1) * FLANK_DETOUR
  }
  return spot
}

/** Lined up to attack: within reach in X, depth tolerance in Z, and on an allowed side. */
export const inAttackPosition = (
  ctx: BrawlerContext,
  cfg: BrawlerConfig,
  behavior: AiBehavior
): boolean => {
  const dx = ctx.target.x - ctx.self.x
  const dz = ctx.target.z - ctx.self.z
  if (Math.abs(dx) > behavior.reach || Math.abs(dz) > cfg.depthTolerance) return false
  if (behavior.attackFrom === 'any') return true
  const side = ctx.self.x >= ctx.target.x ? 1 : -1
  return side === -(ctx.targetFacingX ?? 1)
}

/**
 * Outside reach but within `farReach` in X (and lined up in depth, on an
 * allowed side): where a `far` attack such as a charge can start.
 */
export const inFarPosition = (ctx: BrawlerContext, cfg: BrawlerConfig, behavior: AiBehavior): boolean => {
  if (behavior.farReach === undefined) return false
  const dx = Math.abs(ctx.target.x - ctx.self.x)
  if (dx <= behavior.reach || dx > behavior.farReach) return false
  return inAttackPosition(ctx, cfg, { ...behavior, reach: behavior.farReach })
}

/** Which kind of attack fits where the enemy stands now, if any. */
export const attackRangeAt = (ctx: BrawlerContext, cfg: BrawlerConfig, behavior: AiBehavior): 'near' | 'far' | null =>
  inAttackPosition(ctx, cfg, behavior) ? 'near' : inFarPosition(ctx, cfg, behavior) ? 'far' : null

/**
 * Enemy AI shared by every archetype: once engaged, walk to the behavior's
 * approach spot (level with the target in depth), keeping spacing from other
 * enemies. In attack position, circle if crowded while someone else is
 * attacking, otherwise stand and ask to attack (the attack token). Until it
 * first comes within aggro range (or is forced to engage, as off-screen
 * enemies are), patrol to random nearby points; after that it stays engaged.
 * With a `far` attack ready (`ctx.farAttack`) it also attacks from far reach.
 * Always faces the target horizontally.
 *
 * `move` is the walk-speed fraction, so patrol and circling are slower.
 */
export const enemyIntent = (
  ctx: BrawlerContext,
  mem: BrawlerMemory,
  cfg: BrawlerConfig,
  behavior: AiBehavior,
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

    // A charge from far reach, when one is ready.
    if (ctx.farAttack && !ctx.tokensTaken && inFarPosition(ctx, cfg, behavior)) {
      return { move: { x: 0, z: 0 }, face, jump: false, attack: true }
    }

    if (!inAttackPosition(ctx, cfg, behavior)) {
      const spot = approachSpot(ctx, behavior)
      let move = normalize({ x: spot.x - ctx.self.x, z: spot.z - ctx.self.z })
      if (crowded) {
        const p = scale(normalize(push), cfg.avoidanceWeight)
        const d = scale(move, 1 - cfg.avoidanceWeight)
        move = normalize({ x: p.x + d.x, z: p.z + d.z })
      }
      return { move, face, jump: false, attack: false }
    }

    if (crowded && ctx.tokensTaken) {
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
