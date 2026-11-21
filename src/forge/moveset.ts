// Editing the player's moveset in the Forge: rows in order, the first match wins.

import { MOVESET_ACTIONS, pressKey, type MoveTrigger, type Moveset, type MovesetAction } from '../sim/moveset'

/** Every press a row can use: each action, then each pair of actions as a chord. */
export const PRESS_CHOICES: string[] = [
  ...MOVESET_ACTIONS,
  ...MOVESET_ACTIONS.flatMap((a, i) => MOVESET_ACTIONS.slice(i + 1).map((b) => pressKey([a, b]))),
]

/** A press name back into a trigger's `action`. */
export const actionFor = (press: string): MoveTrigger['action'] => {
  const parts = press.split('+') as MovesetAction[]
  return parts.length === 1 ? parts[0] : parts
}

/** Move row `i` up (-1) or down (+1). */
export const moveRow = (m: Moveset, i: number, delta: number): Moveset => {
  const j = i + delta
  if (j < 0 || j >= m.length) return m
  const out = [...m]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Replace row `i`, dropping optional fields set to undefined. */
export const setRow = (m: Moveset, i: number, row: MoveTrigger): Moveset =>
  m.map((t, k) => (k === i ? (Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as unknown as MoveTrigger) : t))

export const removeRow = (m: Moveset, i: number): Moveset => (m.length > 1 ? m.filter((_, k) => k !== i) : m)

/** A new row goes first, so it isn't hidden behind the plain attack. */
export const addRow = (m: Moveset, move: string): Moveset => [{ action: 'attack', direction: 'away', move }, ...m]
