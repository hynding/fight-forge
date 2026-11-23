// The players: who they are (slot 1 is player 1, `p1` in the scene), which
// one an enemy goes for, and where the camera looks when there are several.
// Pure TS; the store, the scene and the enemy AI use it.

import type { Vec2 } from './fighter'

/** The player slots a scene can have. */
export const PLAYER_SLOTS = [1, 2] as const

/** A player's fighter name in the scene (its runtime and body): `p1`, `p2`. */
export const playerId = (slot: number): string => `p${slot}`

/** Whether a fighter name is a player's (not an enemy's). */
export const isPlayerId = (name: string): boolean => /^p[1-9]$/.test(name)

/** The slot of a player's fighter name (`p2` → 2). */
export const slotOf = (name: string): number => Number(name.slice(1))

/** A player an enemy could go for. */
export interface TargetCandidate extends Vec2 {
  id: string
}

/**
 * The player an enemy at `self` goes for: the nearest (planar). It keeps its
 * current target unless another is closer by more than `margin`, so it
 * doesn't flip-flop between two players at about the same distance.
 */
export const nearestPlayer = (self: Vec2, players: readonly TargetCandidate[], current: string | null, margin: number): string | null => {
  let best: TargetCandidate | null = null
  let bestD = Infinity
  let currentD = Infinity
  for (const p of players) {
    const d = Math.hypot(p.x - self.x, p.z - self.z)
    if (p.id === current) currentD = d
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  if (!best) return null
  return currentD !== Infinity && currentD <= bestD + margin ? current : best.id
}

/** Where the camera follows: the middle of the players' spread along X (null with none). */
export const playersFocus = (xs: readonly number[]): number | null =>
  xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : null

/** The player furthest along the stage (the level script triggers on them), or null. */
export const leadX = (xs: readonly number[]): number | null => (xs.length ? Math.max(...xs) : null)
