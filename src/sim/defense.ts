// Defensive and movement actions: blocking, dodging (a short invulnerable
// sidestep in depth), and running from a double-tap. Pure TS; FighterBody and
// combat call into it, and the tuning lives in `DEFAULT_CONFIG.actions`.

import type { MoveDef } from './moves'

const EPSILON = 1e-9

export interface ActionsConfig {
  run: {
    /** Walk speed multiplier while running. */
    speedFactor: number
    /** Seconds between the two taps of a double-tap. */
    doubleTapWindow: number
  }
  block: {
    /** Damage multiplier for a blocked hit. */
    damageFactor: number
    /** Seconds of blockstun a blocked hit causes. */
    blockstun: number
    /** Knockback multiplier for a blocked hit (it never launches). */
    knockbackFactor: number
  }
  dodge: {
    /** Seconds of the sidestep; invulnerable throughout. */
    duration: number
    /** Depth speed during the sidestep. */
    speed: number
    /** Seconds after a dodge before the next. */
    cooldown: number
  }
}

/** True when a fighter facing `facingX` (±1) at `defenderX` faces an attacker at `attackerX`. */
export const facesAttacker = (facingX: number, defenderX: number, attackerX: number): boolean => {
  const d = attackerX - defenderX
  return Math.abs(d) < 1e-6 || Math.sign(d) === facingX
}

export interface BlockedHit {
  damage: number
  blockstun: number
  knockbackX: number
}

/** What a hit does when blocked: chip damage, blockstun, reduced knockback, no launch or knockdown. */
export const blockedHit = (move: MoveDef, cfg: ActionsConfig['block']): BlockedHit => ({
  damage: Math.round(move.damage * cfg.damageFactor),
  blockstun: cfg.blockstun,
  knockbackX: move.reaction.knockback.x * cfg.knockbackFactor,
})

export interface DodgeState {
  timeLeft: number
  /** -1 into the background, +1 toward the camera. */
  dirZ: number
  cooldownLeft: number
}

export const createDodgeState = (): DodgeState => ({ timeLeft: 0, dirZ: 0, cooldownLeft: 0 })

export const isDodging = (s: DodgeState): boolean => s.timeLeft > 0

export const canDodge = (s: DodgeState): boolean => s.timeLeft === 0 && s.cooldownLeft === 0

/** Starts a sidestep; with no depth input it steps into the background. */
export const startDodge = (s: DodgeState, moveZ: number, cfg: ActionsConfig['dodge']): void => {
  s.timeLeft = cfg.duration
  s.dirZ = moveZ > 0 ? 1 : -1
  s.cooldownLeft = cfg.duration + cfg.cooldown
}

export const stepDodge = (s: DodgeState, dt: number): void => {
  s.cooldownLeft = s.cooldownLeft - dt <= EPSILON ? 0 : s.cooldownLeft - dt
  if (s.timeLeft > 0) {
    s.timeLeft = s.timeLeft - dt <= EPSILON ? 0 : s.timeLeft - dt
    if (s.timeLeft === 0) s.dirZ = 0
  }
}

/** Double-tap detector for running: tap a direction, release, tap it again within the window and hold. */
export interface RunDetector {
  /** Horizontal direction held last step (-1, 0, 1). */
  held: number
  /** Direction and time of the last tap (press). */
  lastTapDir: number
  lastTapTime: number
  running: boolean
}

export const createRunDetector = (): RunDetector => ({
  held: 0,
  lastTapDir: 0,
  lastTapTime: -Infinity,
  running: false,
})

/** Steps the detector with this step's horizontal input; returns whether the fighter is running. */
export const stepRunDetector = (
  r: RunDetector,
  moveX: number,
  now: number,
  cfg: ActionsConfig['run']
): boolean => {
  const dir = moveX > 0 ? 1 : moveX < 0 ? -1 : 0
  if (dir !== r.held) {
    r.running = false
    if (dir !== 0) {
      if (dir === r.lastTapDir && now - r.lastTapTime <= cfg.doubleTapWindow + EPSILON) r.running = true
      r.lastTapDir = dir
      r.lastTapTime = now
    }
  }
  r.held = dir
  return r.running
}
