// Pickups: items on the ground that heal or score when the player walks over
// them. Placed by levels or dropped by defeated enemies. Pure TS.

import type { Vec2 } from './fighter'

export interface PickupDef {
  effect: 'heal' | 'score'
  amount: number
  /** Look: colour and rough size of the item. */
  color: string
  size: number
}

/** A pickup lying on the stage. */
export interface PickupInstance {
  id: string
  /** Name in `DEFAULT_CONFIG.pickups`. */
  pickup: string
  x: number
  z: number
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

export interface PickupTargetState {
  playerHealth: number
  playerMaxHealth: number
  score: number
}

/** What collecting a pickup changes: health capped at max, or score. */
export const applyPickup = (s: PickupTargetState, def: PickupDef): Partial<PickupTargetState> =>
  def.effect === 'heal'
    ? { playerHealth: Math.min(s.playerMaxHealth, s.playerHealth + def.amount) }
    : { score: s.score + def.amount }
