// Movesets: which move a press starts. A fighter's `moveset` is an ordered
// list of triggers; the first whose conditions match starts its move. A
// trigger names an action (or a chord of actions pressed together), and
// optionally the situation, the held direction and a cost. Pure TS.

import type { Vec2 } from './fighter'

/** Actions a trigger can use. Chords can also include jump, block and dodge. */
export const MOVESET_ACTIONS = ['attack', 'jump', 'block', 'dodge'] as const
export type MovesetAction = (typeof MOVESET_ACTIONS)[number]

/** Where the fighter is: `ground` (the default; not blocking), `air`, `running` or `blocking`. */
export const SITUATIONS = ['ground', 'air', 'running', 'blocking'] as const
export type Situation = (typeof SITUATIONS)[number]

/** The held direction, relative to the way the fighter faces; `up` is into the depth. */
export const DIRECTIONS = ['toward', 'away', 'up', 'down'] as const
export type Direction = (typeof DIRECTIONS)[number]

export interface MoveCost {
  /** Health spent (never the last point: the move can't start without enough). */
  health?: number
  /** Seconds before this trigger can fire again. */
  cooldown?: number
}

export interface MoveTrigger {
  /** One action, or two or three pressed together within `input.chordWindow`. */
  action: MovesetAction | MovesetAction[]
  when?: Situation
  direction?: Direction
  move: string
  cost?: MoveCost
}

export type Moveset = MoveTrigger[]

export const triggerActions = (t: Pick<MoveTrigger, 'action'>): MovesetAction[] => (Array.isArray(t.action) ? t.action : [t.action])

/** A press's name: the action, or a chord's actions in a fixed order joined by `+` (`attack+jump`). */
export const pressKey = (actions: readonly string[]): string =>
  [...actions].sort((a, b) => MOVESET_ACTIONS.indexOf(a as MovesetAction) - MOVESET_ACTIONS.indexOf(b as MovesetAction)).join('+')

export const triggerKey = (t: Pick<MoveTrigger, 'action'>): string => pressKey(triggerActions(t))

/** Every press name a moveset can use: each action, and each of its chords. */
export const pressKeys = (moveset: Moveset): string[] => [...new Set([...MOVESET_ACTIONS, ...moveset.map(triggerKey)])]

/** The held direction relative to facing, or null when nothing (much) is held. */
export const relativeDirection = (move: Vec2, facingX: number): Direction | null => {
  const ax = Math.abs(move.x)
  const az = Math.abs(move.z)
  if (ax < 0.3 && az < 0.3) return null
  if (az > ax) return move.z < 0 ? 'up' : 'down'
  return Math.sign(move.x) === Math.sign(facingX || 1) ? 'toward' : 'away'
}

export interface TriggerContext {
  air: boolean
  running: boolean
  blocking: boolean
  direction: Direction | null
  /** Whether trigger `index` can be paid for now (health, cooldown). */
  canPay: (trigger: MoveTrigger, index: number) => boolean
}

const situationMatches = (when: Situation, c: TriggerContext): boolean => {
  switch (when) {
    case 'air':
      return c.air
    case 'running':
      return !c.air && c.running && !c.blocking
    case 'blocking':
      return !c.air && c.blocking
    case 'ground':
      return !c.air && !c.blocking
  }
}

/** The index of the first trigger a press (action or chord key) starts, or -1. */
export const matchTrigger = (moveset: Moveset, press: string, c: TriggerContext): number =>
  moveset.findIndex(
    (t, i) =>
      triggerKey(t) === press &&
      situationMatches(t.when ?? 'ground', c) &&
      (t.direction === undefined || t.direction === c.direction) &&
      c.canPay(t, i)
  )

/**
 * Triggers that can never fire because an earlier one always matches first:
 * the same press, a situation that covers it (`ground` covers `running`), any
 * direction or the same one, and no cost that could make it fail.
 */
export const shadowedTriggers = (moveset: Moveset): number[] => {
  const covers = (a: Situation, b: Situation) => a === b || (a === 'ground' && b === 'running')
  return moveset.flatMap((t, j) =>
    moveset
      .slice(0, j)
      .some(
        (e) =>
          triggerKey(e) === triggerKey(t) &&
          covers(e.when ?? 'ground', t.when ?? 'ground') &&
          (e.direction === undefined || e.direction === t.direction) &&
          !e.cost
      )
      ? [j]
      : []
  )
}

// ------------------------------------------------------------------ chords

/** Chord timing state. Mutable; one per fighter. */
export interface ChordBuffer {
  /** Actions pressed that may still become part of a chord, with when they were pressed. */
  pending: Map<MovesetAction, number>
  /** Actions used up by a chord, ignored until released. */
  consumed: Set<MovesetAction>
}

export const createChordBuffer = (): ChordBuffer => ({ pending: new Map(), consumed: new Set() })

export interface ChordStep {
  /** This step's presses, chords first: each a press key. */
  presses: string[]
  /** Actions the controller shouldn't see as on this step (waiting to see if a chord completes, or used by one). */
  hidden: Set<MovesetAction>
  /** Actions to show as on for this step: a press held back for the chord window that turned out to be single. */
  tapped: Set<MovesetAction>
}

const EPSILON = 1e-9

/**
 * Steps chord detection. An action that's part of a chord in the moveset is
 * held back for up to `window` seconds: if the chord's other actions arrive in
 * time, the chord is pressed instead (and its actions are ignored until
 * released); otherwise the action is pressed alone, late. Actions in no chord
 * pass straight through, so a moveset without chords adds no delay.
 */
export const stepChords = (
  b: ChordBuffer,
  pressed: ReadonlySet<MovesetAction>,
  held: ReadonlySet<MovesetAction>,
  now: number,
  window: number,
  moveset: Moveset
): ChordStep => {
  const chords = moveset.map(triggerActions).filter((a) => a.length > 1)
  const inChord = new Set(chords.flat())
  const singles: string[] = []
  const chorded: string[] = []
  const tapped = new Set<MovesetAction>()
  for (const a of MOVESET_ACTIONS) {
    if (!pressed.has(a)) continue
    if (inChord.has(a)) {
      if (!b.pending.has(a)) b.pending.set(a, now)
    } else singles.push(a)
  }
  for (const actions of chords) {
    if (!actions.every((a) => b.pending.has(a))) continue
    chorded.push(pressKey(actions))
    for (const a of actions) {
      b.pending.delete(a)
      b.consumed.add(a)
    }
  }
  for (const [a, at] of [...b.pending]) {
    if (now - at + EPSILON < window) continue
    b.pending.delete(a)
    singles.push(a)
    tapped.add(a)
  }
  for (const a of [...b.consumed]) if (!held.has(a) && !pressed.has(a)) b.consumed.delete(a)
  return { presses: [...chorded, ...singles], hidden: new Set([...b.pending.keys(), ...b.consumed]), tapped }
}
