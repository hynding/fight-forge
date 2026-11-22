// Pickups: items on the ground that heal or score when the player walks over
// them. Placed by levels or dropped by defeated enemies. Pure TS.

import type { Vec2 } from './fighter'

export interface PickupDef {
  /** `weapon` lies on the floor until a fighter picks it up (attack while standing on it). */
  effect: 'heal' | 'score' | 'weapon'
  amount: number
  /** Look: colour and rough size of the item. */
  color: string
  size: number
  /** For `effect: "weapon"`: the weapon id. */
  weapon?: string
}

/** A pickup lying on the stage. */
export interface PickupInstance {
  id: string
  /** Pickup id in the content's `pickups`. */
  pickup: string
  x: number
  z: number
  /** A dropped weapon's hits left (a fresh one has its full durability). */
  durability?: number
}

/** A chance of an enemy dropping a pickup when defeated. */
export interface DropDef {
  pickup: string
  /** 0..1 */
  chance: number
}

/** Whether a player at `player` (planar) is close enough to collect `item`. */
export const inPickupReach = (player: Vec2, item: Vec2, radius: number): boolean =>
  Math.hypot(player.x - item.x, player.z - item.z) <= radius

/** The pickup an enemy drops, if the roll succeeds. */
export const rollDrop = (drop: DropDef | undefined, random: () => number = Math.random): string | null =>
  drop && random() < drop.chance ? drop.pickup : null

/** The player collecting a pickup, and the score. */
export interface PickupTargetState {
  health: number
  maxHealth: number
  score: number
}

/** What collecting a pickup changes: health capped at max, or score. */
export const applyPickup = (s: PickupTargetState, def: PickupDef): Partial<PickupTargetState> =>
  def.effect === 'heal'
    ? { health: Math.min(s.maxHealth, s.health + def.amount) }
    : def.effect === 'score'
      ? { score: s.score + def.amount }
      : {}
