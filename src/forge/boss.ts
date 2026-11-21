// The Forge's BOSS card: turning an enemy type into a boss and editing its
// phases on a health bar. Pure helpers over the pack JSON.

import type { BossDef, BossPhase } from '../sim/boss'
import type { Level } from '../sim/level'

/** Thresholds stay this far apart (and inside the bar) when dragged. */
export const PHASE_GAP = 0.02

/** A new boss block with sensible defaults and no phases yet. */
export const defaultBoss = (title: string): BossDef => ({
  title: title.toUpperCase().slice(0, 40),
  poise: { hits: 3, window: 2 },
  transition: { duration: 1, push: 7, radius: 4 },
  phases: [],
})

const round = (n: number) => Math.round(n * 100) / 100

/** Adds a phase starting below `below`, keeping phases ordered high to low; returns the new boss and the phase's index. */
export const addPhase = (boss: BossDef, below: number): { boss: BossDef; index: number } => {
  const at = Math.min(1 - PHASE_GAP, Math.max(PHASE_GAP, round(below)))
  if (boss.phases.some((p) => Math.abs(p.below - at) < PHASE_GAP)) return { boss, index: boss.phases.findIndex((p) => Math.abs(p.below - at) < PHASE_GAP) }
  const phases: BossPhase[] = [...boss.phases, { below: at }].sort((a, b) => b.below - a.below)
  return { boss: { ...boss, phases }, index: phases.findIndex((p) => p.below === at) }
}

/** Moves phase `i`'s threshold, kept between its neighbours so the order never changes. */
export const movePhase = (boss: BossDef, i: number, below: number): BossDef => {
  const hi = i > 0 ? boss.phases[i - 1].below - PHASE_GAP : 1 - PHASE_GAP
  const lo = i < boss.phases.length - 1 ? boss.phases[i + 1].below + PHASE_GAP : PHASE_GAP
  const at = round(Math.min(hi, Math.max(lo, below)))
  return { ...boss, phases: boss.phases.map((p, j) => (j === i ? { ...p, below: at } : p)) }
}

export const removePhase = (boss: BossDef, i: number): BossDef => ({ ...boss, phases: boss.phases.filter((_, j) => j !== i) })

/** What a phase changes, in words, for its label on the bar. */
export const phaseSummary = (p: BossPhase): string => {
  const parts: string[] = []
  if (p.speed !== undefined) parts.push(`speed ${p.speed}`)
  if (p.aggression !== undefined) parts.push(`aggression ${p.aggression}`)
  if (p.armor !== undefined) parts.push(`armor ${p.armor}`)
  if (p.ai !== undefined) parts.push(`AI ${p.ai}`)
  if (p.attacks) parts.push(`${p.attacks.length} attack${p.attacks.length === 1 ? '' : 's'}`)
  if (p.color) parts.push('colour')
  if (p.summon) parts.push(`summons ${p.summon.enemies.length}`)
  if (p.taunt) parts.push('taunt')
  return parts.length ? parts.join(', ') : 'no changes yet'
}

/** Health (fraction of max) a sandbox boss starts with to begin at phase `n` (0 = the start). */
export const phaseStartHealth = (boss: BossDef, n: number): number => {
  if (n <= 0 || boss.phases.length === 0) return 1
  const p = boss.phases[Math.min(n, boss.phases.length) - 1]
  return Math.max(0.01, p.below - 0.01)
}

/** A one-screen sandbox level: the boss walks in and beating it ends the fight. */
export const bossSandboxLevel = (type: string, theme = 'default'): Level => ({
  id: 'forge-sandbox',
  name: `Sandbox: ${type}`,
  theme,
  segments: [{ length: 30, triggers: [{ kind: 'boss', at: 3, enemy: type, from: 'placed', offset: 5, depth: 0.5, intro: true }] }],
})
