// The Forge's projectile helpers: which moves fire a projectile, and the
// height it leaves from, for the PROJECTILE card's side view. Pure.

import { getIn } from './paths'
import { baseContent, type PackJson } from './workspace'
import type { ProjectileFire } from '../sim/projectiles'

type Json = Record<string, unknown>

/** The fire offset used when no move fires the projectile yet. */
export const DEFAULT_FROM: [number, number] = [0.6, 0.3]

/** The moves (the pack's over the default pack's) that fire projectile `id`, by id, with where they fire it from. */
export const firingMoves = (json: PackJson, id: string): { move: string; from: [number, number] }[] => {
  const moves = { ...(baseContent().moves as Record<string, Json>), ...((getIn(json, ['moves']) ?? {}) as Record<string, Json>) }
  return Object.entries(moves).flatMap(([move, def]) => {
    const fire = def?.projectile as ProjectileFire | undefined
    return fire?.id === id ? [{ move, from: fire.from }] : []
  })
}
