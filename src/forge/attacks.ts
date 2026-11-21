// The Forge's ATTACKS card: an enemy type's attack list as rows. A type that
// only has `attackMove` (or nothing) shows that as one row; the first edit
// turns it into an `attacks` list.

import { attacksOf, type AttackDef } from '../sim/attacks'

type Json = Record<string, unknown>

/** The rows to show for an enemy type (its attacks, or its single attack move). */
export const attackRows = (enemy: Json, defaultMove: string): AttackDef[] =>
  attacksOf({ attacks: enemy.attacks as AttackDef[] | undefined, attackMove: enemy.attackMove as string | undefined }, defaultMove)

/** The enemy type with `rows` as its attacks (replacing `attackMove`). */
export const withAttacks = (enemy: Json, rows: AttackDef[]): Json => {
  const { attackMove: _old, ...rest } = enemy
  void _old
  return { ...rest, attacks: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as unknown as AttackDef) }
}

/** Range problems worth a warning: far attacks the archetype can't use, or a type with no near attack. */
export const attackWarnings = (rows: AttackDef[], farReach: number | undefined): string[] => {
  const warnings: string[] = []
  if (rows.some((r) => r.range === 'far') && farReach === undefined)
    warnings.push('Its AI archetype has no far reach, so far attacks are never used.')
  if (!rows.some((r) => r.range !== 'far' && (r.weight ?? 1) > 0)) warnings.push('No near attack: it walks up to you and never hits.')
  return warnings
}
