// Game rules that change combat: difficulty multipliers and friendly fire.
// Pure TS; combat and the level director call these with `rules` from the
// active content.

import { isPlayerId } from './players'

/** Damage after a multiplier, as whole points; a hit that did damage always does at least 1. */
export const scaledDamage = (damage: number, multiplier: number): number =>
  damage <= 0 || multiplier <= 0 ? 0 : Math.max(1, Math.round(damage * multiplier))

/** An enemy's max health after the difficulty multiplier (at least 1). */
export const scaledHealth = (health: number, multiplier: number): number => Math.max(1, Math.round(health * multiplier))

/**
 * Who an attacker's hitbox can hit: a player hits every enemy, and the other
 * players in `teammates` (co-op friendly fire); an enemy hits the players it
 * may attack (`players`), and with friendly fire also every other enemy.
 */
export const combatTargets = (
  attacker: string,
  players: readonly string[],
  enemies: Iterable<string>,
  friendlyFire: boolean,
  teammates: readonly string[] = []
): string[] =>
  isPlayerId(attacker)
    ? [...enemies, ...teammates.filter((p) => p !== attacker)]
    : friendlyFire
      ? [...players, ...[...enemies].filter((e) => e !== attacker)]
      : [...players]
