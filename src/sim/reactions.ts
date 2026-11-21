// Hit reactions: hitstun, knockdown, getup, and brief invulnerability after
// getting up. Pure TS; the fighter step advances it and combat applies hits.

import type { HitReaction } from './moves'

const EPSILON = 1e-9

export interface ReactionConfig {
  /** Seconds on the ground after a knockdown, including the fall. */
  knockdownDuration: number
  getupDuration: number
  /** Invulnerable this long after getting up. */
  getupInvulnerability: number
  /** Knockback velocity multiplier per 60 Hz step while reacting. */
  knockbackFriction: number
}

/** `held`: in another fighter's grab, until it breaks free (`timeLeft`) or is thrown. */
export type ReactionKind = 'hitstun' | 'blockstun' | 'knockdown' | 'getup' | 'held'

export interface ReactionState {
  kind: ReactionKind | null
  timeLeft: number
  invulnerableLeft: number
}

export const createReactionState = (): ReactionState => ({
  kind: null,
  timeLeft: 0,
  invulnerableLeft: 0,
})

/** Down, getting up, or just up: hits pass through. */
export const isInvulnerable = (s: ReactionState): boolean =>
  s.kind === 'knockdown' || s.kind === 'getup' || s.invulnerableLeft > 0

/**
 * Applies a hit's reaction. Returns false (and changes nothing) if the target
 * is invulnerable. A hit during hitstun restarts it, so combos keep the target stunned.
 * A held target stays held unless the hit knocks it down.
 */
export const applyHit = (s: ReactionState, hit: HitReaction, cfg: ReactionConfig): boolean => {
  if (isInvulnerable(s)) return false
  if (s.kind === 'held' && !hit.knockdown) return true
  if (hit.knockdown) {
    s.kind = 'knockdown'
    s.timeLeft = cfg.knockdownDuration
  } else if (hit.hitstun > 0) {
    s.kind = 'hitstun'
    s.timeLeft = hit.hitstun
  }
  return true
}

/** A blocked hit: a short stun that keeps the guard up (see FighterBody). */
export const applyBlockstun = (s: ReactionState, seconds: number): void => {
  s.kind = 'blockstun'
  s.timeLeft = seconds
}

/** Advances the reaction: hitstun ends, knockdown leads to getup, getup to invulnerability. */
export const stepReaction = (s: ReactionState, dt: number, cfg: ReactionConfig): void => {
  s.invulnerableLeft = s.invulnerableLeft - dt <= EPSILON ? 0 : s.invulnerableLeft - dt
  if (s.kind === null) return
  s.timeLeft -= dt
  if (s.timeLeft > EPSILON) return
  if (s.kind === 'knockdown') {
    s.kind = 'getup'
    s.timeLeft = cfg.getupDuration
  } else {
    if (s.kind === 'getup') s.invulnerableLeft = cfg.getupInvulnerability
    s.kind = null
    s.timeLeft = 0
  }
}
