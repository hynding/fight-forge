// Pure game-time timers stepped by sim systems. Kept free of React and Rapier
// so their behavior is unit-testable.

// Float slack so a 0.2s timer ends after exactly 12 steps of 1/60s, not 13.
const EPSILON = 1e-9

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

/** Gives up the slot early (e.g. the holder was hit) and starts the recovery wait. */
export const releaseAttackSlotEarly = (t: AttackSlotTimer, cfg: AttackSlotConfig): void => {
  if (t.holdLeft === 0) return
  t.holdLeft = 0
  t.recoveryLeft = cfg.attackSlotRecovery
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
