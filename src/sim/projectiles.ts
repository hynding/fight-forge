// Projectiles: hitboxes with their own position and velocity (a thrown knife,
// a hurled barrel). A move fires one with `projectile` as its active frames
// begin; it flies (speed forward, `lift` up, pulled down by `gravity`), hits
// each target once, and stops at its first hit unless `pierce` lets it carry
// on. It is gone when its lifetime runs out, it leaves the stage or it lands.
// Pure TS; the `projectiles` sim system owns the live list.

import type { Box } from './combat'
import type { HitReaction } from './moves'

// Float slack so a lifetime ends on a whole 60 Hz step.
const EPSILON = 1e-9

export type ProjectileShape = 'box' | 'cylinder' | 'sphere'

export interface ProjectileDef {
  /** What it looks like: a box (long side along its flight), a cylinder (upright) or a sphere. */
  shape: ProjectileShape
  /** Width along the flight, height, depth (a cylinder's or sphere's diameter is the first). */
  size: [number, number, number]
  color: string
  /** Forward speed, along the thrower's facing. */
  speed: number
  /** Upward speed at launch (0 for a straight throw). */
  lift: number
  /** Downward acceleration (0 flies straight). */
  gravity: number
  /** Half extents of the box it hits with, around its centre. */
  hitbox: { halfX: number; halfY: number; halfZ: number }
  damage: number
  reaction: HitReaction
  /** Seconds before it disappears. */
  lifetime: number
  /** How many more targets it flies through after its first hit (default 0: it stops). */
  pierce?: number
  /** Sound id played when it hits, instead of the audio settings' `hit`. */
  hitSound?: string
  /** Turns per second around its depth axis, for show. */
  spin?: number
}

/** A move's projectile: which one, fired from `from` = [forward, up] off the attacker's centre (× its scale). */
export interface ProjectileFire {
  id: string
  from: [number, number]
}

/** One projectile in flight. Mutable; stepped by the projectiles system. */
export interface Projectile {
  /** Unique within the scene. */
  key: number
  /** Projectile definition id. */
  def: string
  /** The fighter that fired it (`player` or an enemy id). */
  owner: string
  x: number
  y: number
  z: number
  vx: number
  vy: number
  /** Direction of travel along X: knockback goes this way. */
  dirX: number
  /** Seconds since it was fired. */
  age: number
  /** Targets (fighter or prop ids) it has hit. */
  hit: Set<string>
  pierceLeft: number
  /**
   * May hit the player: an enemy's projectile fired while it held an attack
   * token (or had its own slot). It keeps this until it lands.
   */
  hurtsPlayer: boolean
}

export interface ProjectileWorld {
  list: Projectile[]
  nextKey: number
}

export const createProjectileWorld = (): ProjectileWorld => ({ list: [], nextKey: 1 })

/** Fires `def` from a fighter at `origin` (its body centre) facing `facingX`. */
export const launchProjectile = (
  world: ProjectileWorld,
  defId: string,
  def: ProjectileDef,
  fire: ProjectileFire,
  shooter: { owner: string; origin: { x: number; y: number; z: number }; facingX: number; scale: number; hurtsPlayer: boolean }
): Projectile => {
  const dirX = shooter.facingX >= 0 ? 1 : -1
  const p: Projectile = {
    key: world.nextKey++,
    def: defId,
    owner: shooter.owner,
    x: shooter.origin.x + dirX * fire.from[0] * shooter.scale,
    y: shooter.origin.y + fire.from[1] * shooter.scale,
    z: shooter.origin.z,
    vx: dirX * def.speed,
    vy: def.lift,
    dirX,
    age: 0,
    hit: new Set(),
    pierceLeft: def.pierce ?? 0,
    hurtsPlayer: shooter.hurtsPlayer,
  }
  world.list.push(p)
  return p
}

export type FlightResult = 'flying' | 'expired' | 'left' | 'landed'

/** Where it may fly: the stage's ends in X and the floor's top. */
export interface FlightBounds {
  minX: number
  maxX: number
  floorY: number
}

/** Moves a projectile by `dt`; anything but `flying` means it's done. */
export const stepProjectile = (p: Projectile, def: ProjectileDef, dt: number, bounds: FlightBounds): FlightResult => {
  p.vy -= def.gravity * dt
  p.x += p.vx * dt
  p.y += p.vy * dt
  p.age += dt
  if (p.age + EPSILON >= def.lifetime) return 'expired'
  if (p.x < bounds.minX || p.x > bounds.maxX) return 'left'
  if (p.vy < 0 && p.y - def.hitbox.halfY <= bounds.floorY) return 'landed'
  return 'flying'
}

/** The box it hits with, in world space. */
export const projectileBox = (p: Projectile, def: ProjectileDef): Box => ({
  center: { x: p.x, y: p.y, z: p.z },
  half: { x: def.hitbox.halfX, y: def.hitbox.halfY, z: def.hitbox.halfZ },
})

/**
 * Who it may hit: the player's projectiles hit enemies; an enemy's hits the
 * player (and, with friendly fire, other enemies) only if it may hurt the player.
 */
export const projectileTargets = (p: Projectile, player: string, enemies: Iterable<string>, friendlyFire: boolean): string[] => {
  if (p.owner === player) return [...enemies]
  if (!p.hurtsPlayer) return []
  return friendlyFire ? [player, ...[...enemies].filter((e) => e !== p.owner)] : [player]
}

/** Records a hit on `target`; returns true when the projectile stops there. */
export const registerHit = (p: Projectile, target: string): boolean => {
  p.hit.add(target)
  if (p.pierceLeft > 0) {
    p.pierceLeft--
    return false
  }
  return true
}

/** A point along a flight, `t` seconds after launch, relative to where it was fired. */
export interface FlightPoint {
  t: number
  x: number
  y: number
}

export interface FlightPath {
  points: FlightPoint[]
  /** How it ends with nothing in the way. */
  end: 'expired' | 'landed'
  /** Seconds in the air. */
  time: number
  /** Distance travelled forward. */
  range: number
  /** Highest point above the launch height. */
  apex: number
}

/**
 * The flight with nothing in the way, sampled every `step` seconds, fired
 * `height` above the floor: for the Forge's side view.
 */
export const flightPath = (def: ProjectileDef, height: number, step = 1 / 60): FlightPath => {
  const p: Projectile = { key: 0, def: '', owner: '', x: 0, y: height, z: 0, vx: def.speed, vy: def.lift, dirX: 1, age: 0, hit: new Set(), pierceLeft: 0, hurtsPlayer: false }
  const points: FlightPoint[] = [{ t: 0, x: 0, y: 0 }]
  let apex = 0
  let result: FlightResult = 'flying'
  // Lifetime bounds the loop; a cap guards against a zero step.
  for (let i = 0; i < 100000 && result === 'flying'; i++) {
    result = stepProjectile(p, def, step, { minX: -Infinity, maxX: Infinity, floorY: 0 })
    points.push({ t: p.age, x: p.x, y: p.y - height })
    apex = Math.max(apex, p.y - height)
  }
  return { points, end: result === 'landed' ? 'landed' : 'expired', time: p.age, range: p.x, apex }
}
