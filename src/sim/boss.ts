// Bosses: an enemy type with a `boss` block. Phases change its stats as its
// health drops below thresholds; poise lets it shrug off knockdowns until it
// has taken enough hits in a row. Pure TS; Enemy and CombatSystem apply it.

import type { AttackDef } from './attacks'
import type { HitReaction } from './moves'
import type { SpawnDef } from './level'

/** What a phase changes; fields it leaves out keep the previous phase's value. */
export interface BossPhase {
  /** Starts when health first drops below this fraction of max health. */
  below: number
  speed?: number
  aggression?: number
  armor?: number
  /** AI archetype id. */
  ai?: string
  attacks?: AttackDef[]
  /** Body tint. */
  color?: string
  /** Helpers that come in as the phase starts. */
  summon?: { enemies: SpawnDef[] }
  /** Sound played as the phase starts. */
  taunt?: string
}

export interface BossDef {
  title: string
  subtitle?: string
  /** Knockdowns are shrugged off until `hits` hits land within `window` seconds of each other (hits 0: never). */
  poise: { hits: number; window: number }
  /** A phase change: invulnerable this long, pushing fighters within `radius` away at `push` speed. */
  transition: { duration: number; push: number; radius: number }
  /** True: waits for an attack token like other enemies. Default: its own attack slot. */
  sharesTokens?: boolean
  /** Ordered by threshold, highest first. */
  phases: BossPhase[]
}

/** The stats phases can change. */
export interface PhaseStats {
  speed: number
  aggression: number
  armor: number
  ai: string
  attacks: AttackDef[]
  color: string
}

/** How many phases have started at this fraction of max health (0 = none). */
export const bossPhaseIndex = (phases: BossPhase[], healthFraction: number): number => {
  let n = 0
  while (n < phases.length && healthFraction < phases[n].below) n++
  return n
}

/** The stats after the first `reached` phases, each overriding the ones before. */
export const phaseStats = (base: PhaseStats, phases: BossPhase[], reached: number): PhaseStats => {
  const s = { ...base }
  for (const p of phases.slice(0, reached)) {
    if (p.speed !== undefined) s.speed = p.speed
    if (p.aggression !== undefined) s.aggression = p.aggression
    if (p.armor !== undefined) s.armor = p.armor
    if (p.ai !== undefined) s.ai = p.ai
    if (p.attacks !== undefined) s.attacks = p.attacks
    if (p.color !== undefined) s.color = p.color
  }
  return s
}

/** Hits taken in a row, for poise. */
export interface PoiseState {
  hits: number
  /** Seconds before the count resets. */
  timeLeft: number
}

export const createPoiseState = (): PoiseState => ({ hits: 0, timeLeft: 0 })

export const stepPoise = (s: PoiseState, dt: number): void => {
  s.timeLeft = Math.max(0, s.timeLeft - dt)
  if (s.timeLeft === 0) s.hits = 0
}

/**
 * A hit lands on a fighter with poise: counts it, and returns the reaction it
 * actually gets. A knockdown before `hits` hits in a row becomes a stagger
 * (the move's hitstun, no launch); one that lands resets the count.
 */
export const poiseHit = (s: PoiseState, cfg: BossDef['poise'], hit: HitReaction): HitReaction => {
  s.hits += 1
  s.timeLeft = cfg.window
  if (!hit.knockdown) return hit
  if (s.hits >= cfg.hits) {
    s.hits = 0
    s.timeLeft = 0
    return hit
  }
  return { hitstun: hit.hitstun, knockback: { x: hit.knockback.x, y: 0 }, knockdown: false }
}

/** The push a phase change gives a fighter at `dx` from the boss (0 beyond the radius). */
export const transitionPush = (cfg: BossDef['transition'], dx: number, dz: number): number => {
  if (Math.hypot(dx, dz) > cfg.radius) return 0
  return (Math.sign(dx) || 1) * cfg.push
}

/** A phase's summon, waiting for the LevelDirector to spawn it (placed spawns are relative to `x`). */
export interface SummonRequest {
  enemies: SpawnDef[]
  x: number
}
