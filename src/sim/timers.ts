// Pure game-time timers stepped by sim systems. Kept free of React and Rapier
// so their behavior is unit-testable.

// Float slack so a 0.2s timer ends after exactly 12 steps of 1/60s, not 13.
const EPSILON = 1e-9

export interface PlayerAttackConfig {
  duration: number
  cooldown: number
}

/** Shared between the player (who starts swings) and combat (which resolves them). */
export interface PlayerAttackState {
  active: boolean
  timeLeft: number
  cooldownLeft: number
  /** Increments each time a swing starts; combat uses it for one-hit-per-swing. */
  swing: number
}

export const createPlayerAttackState = (): PlayerAttackState => ({
  active: false,
  timeLeft: 0,
  cooldownLeft: 0,
  swing: 0,
})

export type PlayerAttackEvent = 'started' | 'ended' | null

/**
 * Advances the swing and cooldown timers and starts a swing if requested.
 * The cooldown runs from the start of a swing, as before.
 */
export const stepPlayerAttack = (
  s: PlayerAttackState,
  wantsAttack: boolean,
  dt: number,
  cfg: PlayerAttackConfig
): PlayerAttackEvent => {
  s.cooldownLeft = s.cooldownLeft - dt <= EPSILON ? 0 : s.cooldownLeft - dt
  if (s.active) {
    s.timeLeft -= dt
    if (s.timeLeft <= EPSILON) {
      s.timeLeft = 0
      s.active = false
      return 'ended'
    }
    return null
  }
  if (wantsAttack && s.cooldownLeft === 0) {
    s.active = true
    s.timeLeft = cfg.duration
    s.cooldownLeft = cfg.cooldown
    s.swing++
    return 'started'
  }
  return null
}

export interface AttackSlotConfig {
  /** How long an enemy holds the attacker slot. */
  attackSlotDuration: number
  /** Wait after the hold before it may claim again. */
  attackSlotRecovery: number
}

/** One enemy's view of the single attacker slot (`attackingEnemyId`). */
export interface AttackSlotTimer {
  holdLeft: number
  recoveryLeft: number
}

export const createAttackSlotTimer = (): AttackSlotTimer => ({ holdLeft: 0, recoveryLeft: 0 })

export const canClaimAttackSlot = (t: AttackSlotTimer): boolean =>
  t.holdLeft === 0 && t.recoveryLeft === 0

/** Call when the enemy takes the slot. */
export const startAttackSlotHold = (t: AttackSlotTimer, cfg: AttackSlotConfig): void => {
  t.holdLeft = cfg.attackSlotDuration
}

/**
 * Steps the hold and recovery timers. Returns true on the step the hold ends;
 * the caller then releases the slot only if it still holds it.
 */
export const stepAttackSlot = (t: AttackSlotTimer, dt: number, cfg: AttackSlotConfig): boolean => {
  t.recoveryLeft = t.recoveryLeft - dt <= EPSILON ? 0 : t.recoveryLeft - dt
  if (t.holdLeft > 0) {
    t.holdLeft -= dt
    if (t.holdLeft <= EPSILON) {
      t.holdLeft = 0
      t.recoveryLeft = cfg.attackSlotRecovery
      return true
    }
  }
  return false
}

/** Interval clock: returns true each time `interval` seconds have accumulated. */
export interface IntervalClock {
  elapsed: number
}

export const stepIntervalClock = (c: IntervalClock, dt: number, interval: number): boolean => {
  c.elapsed += dt
  if (c.elapsed + EPSILON < interval) return false
  c.elapsed = Math.max(0, c.elapsed - interval)
  return true
}
