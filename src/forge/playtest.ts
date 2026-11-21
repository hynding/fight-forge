// The Forge playtest loop: after editing mid-fight, decide whether the paused
// scene can carry on with the new content (tuning is read at use time, so it
// applies at once) or the level has changed and must restart from where the
// player stands.

import { placeTriggers, type Level } from '../sim/level'
import type { PlaytestOrigin } from '../store/gameStore'
import { levelCut, levelFrom } from './level'
import { baseContent, type PackJson } from './workspace'

/** The level with this id as the pack has it now (its own or the default's), if any. */
export const packLevel = (json: PackJson, id: string): Level | undefined => {
  const own = (Array.isArray(json.levels) ? (json.levels as Level[]) : []).find((l) => l.id === id)
  return own ?? (baseContent().levels as readonly Level[]).find((l) => l.id === id)
}

/** Where the player starts on a level's stage (X), in this pack. */
export const spawnXOf = (json: PackJson): number => {
  const player = ((json.settings as Record<string, unknown> | undefined)?.player ?? baseContent().settings.player) as { spawnPosition?: number[] }
  return player.spawnPosition?.[0] ?? 0
}

/** A fight started at most this far behind the player is replayed when the level restarts (it's the one on screen). */
export const REPLAY_FIGHT_WITHIN = 15

export type ResumePlan = { kind: 'resume' } | { kind: 'restart'; level: Level; origin: PlaytestOrigin }

/**
 * How to go back to a paused playtest after edits: `resume` if the level
 * played is unchanged (or it was an enemy sandbox); otherwise `restart` the
 * edited level with the player at the stage position they had reached.
 */
export const planResume = (origin: PlaytestOrigin, json: PackJson, playerX: number | null, spawnX: number): ResumePlan => {
  if (!origin.level) return { kind: 'resume' }
  const now = packLevel(json, origin.level.id)
  if (!now || JSON.stringify(now) === JSON.stringify(origin.level.def)) return { kind: 'resume' }
  const at = (playerX ?? spawnX) + origin.level.cut
  // Restart the fight on screen rather than skipping it: it's likely what was just edited.
  const fight = placeTriggers(now)
    .filter((t) => t.kind === 'wave' && t.x <= at && at - t.x <= REPLAY_FIGHT_WITHIN)
    .pop()
  const x = fight ? fight.x : at
  return {
    kind: 'restart',
    level: levelFrom(now, x, spawnX),
    origin: { ...origin, level: { id: now.id, def: now, cut: levelCut(x, spawnX) } },
  }
}
