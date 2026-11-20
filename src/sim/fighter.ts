// The fighter model shared by the player and enemies: what a controller asks
// for (Intent), how that turns into velocity and facing, and the state machine.
// Pure TS so it is testable without React, Rapier, or WebGL.

/** Planar vector on the ground (X right, Z toward the camera). */
export interface Vec2 {
  x: number
  z: number
}

/**
 * What a controller wants this step. `move` components are in [-1, 1] and
 * scale the fighter's walk speed per axis. `face`, when given, overrides
 * facing-from-velocity (enemies keep facing the player while circling).
 */
export interface Intent {
  move: Vec2
  face?: Vec2
  jump: boolean
  attack: boolean
}

export const idleIntent = (): Intent => ({ move: { x: 0, z: 0 }, jump: false, attack: false })

/**
 * Fighter states. M1.1 drives idle / walk / jump / attack / dead; the rest are
 * reserved for later milestones (block and dodge in M1.6, hit reactions in M1.5).
 */
export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'attack'
  | 'block'
  | 'dodge'
  | 'hitstun'
  | 'knockdown'
  | 'getup'
  | 'dead'

export interface FighterStateInputs {
  dead: boolean
  attacking: boolean
  grounded: boolean
  moving: boolean
}

/** Picks the state from this step's facts, highest priority first. */
export const nextFighterState = ({
  dead,
  attacking,
  grounded,
  moving,
}: FighterStateInputs): FighterStateName => {
  if (dead) return 'dead'
  if (attacking) return 'attack'
  if (!grounded) return 'jump'
  if (moving) return 'walk'
  return 'idle'
}

export interface MovementConfig {
  walkSpeed: number
  /**
   * Velocity multiplier per 60 Hz step when no direction is held. 0 stops
   * instantly (enemies); 0.85 gives the player's short arcade slide.
   */
  deceleration: number
  /** Below this speed an axis snaps to 0 while decelerating, and counts as stopped. */
  stopSpeed: number
}

/**
 * Next horizontal velocity: instant acceleration to the intent, otherwise
 * deceleration scaled by `dt` so it holds across step sizes.
 */
export const stepVelocity = (current: Vec2, move: Vec2, cfg: MovementConfig, dt: number): Vec2 => {
  if (move.x !== 0 || move.z !== 0) {
    return { x: move.x * cfg.walkSpeed, z: move.z * cfg.walkSpeed }
  }
  const decel = Math.pow(cfg.deceleration, dt * 60)
  const x = current.x * decel
  const z = current.z * decel
  return {
    x: Math.abs(x) < cfg.stopSpeed ? 0 : x,
    z: Math.abs(z) < cfg.stopSpeed ? 0 : z,
  }
}

export const isMoving = (v: Vec2, stopSpeed: number): boolean =>
  Math.abs(v.x) > stopSpeed || Math.abs(v.z) > stopSpeed

/**
 * New unit facing: the explicit `face` if given, else the velocity direction,
 * else unchanged. Mutates and returns `facing`.
 */
export const updateFacing = (facing: Vec2, velocity: Vec2, face?: Vec2): Vec2 => {
  const src = face ?? velocity
  const len = Math.hypot(src.x, src.z)
  if (len > 0) {
    facing.x = src.x / len
    facing.z = src.z / len
  }
  return facing
}

/** Y rotation that turns a model authored facing -Z toward `facing`. */
export const facingToYaw = (facing: Vec2): number => Math.atan2(-facing.x, -facing.z)

/** Live per-fighter data, updated every sim step. Read it; don't mirror it into React state. */
export interface FighterRuntime {
  state: FighterStateName
  facing: Vec2
  velocity: Vec2
  grounded: boolean
  intent: Intent | null
}

export const createFighterRuntime = (): FighterRuntime => ({
  state: 'idle',
  facing: { x: 0, z: -1 },
  velocity: { x: 0, z: 0 },
  grounded: false,
  intent: null,
})
