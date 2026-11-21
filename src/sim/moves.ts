// Moves with frame data: startup, active and recovery phases, a hitbox, the
// reaction a hit causes, and combo chaining through cancel windows. Pure TS so
// timing is unit-testable without React, Rapier or WebGL.

import type { ClipRef } from './animation'

// Float slack so phase boundaries land on whole 60 Hz steps.
const EPSILON = 1e-9

/**
 * A box in front of the attacker, in world units before the attacker's scale.
 * `forward` is along the facing (left or right), `up` from the body centre.
 */
export interface Hitbox {
  forward: number
  up: number
  halfX: number
  halfY: number
  halfZ: number
}

/** What a hit does to the target. */
export interface HitReaction {
  /** Seconds the target can't act (ignored for a knockdown). */
  hitstun: number
  /** Velocity given to the target: `x` away from the attacker, `y` up. */
  knockback: { x: number; y: number }
  /** Knock the target down (then it gets up, briefly invulnerable). */
  knockdown?: boolean
}

export interface MoveDef {
  /** Seconds before the hitbox comes out. */
  startup: number
  /** Seconds the hitbox is out. */
  active: number
  /** Seconds after the hitbox, before the fighter can act again. */
  recovery: number
  damage: number
  hitbox: Hitbox
  reaction: HitReaction
  /**
   * Animation clip for the move. Its speed should make the clip's impact line
   * up with the active phase; timing never depends on the clip.
   */
  clip?: ClipRef
  /** An air move: started only while airborne, keeps the jump's momentum, and ends on landing. */
  air?: boolean
  /** Forward speed during startup and active (e.g. a dash attack's lunge). */
  lunge?: number
  /** Combo: the move an attack press chains into. */
  next?: string
  /** Seconds into the move from which a buffered press cancels into `next`; defaults to the end of the active phase. */
  cancelFrom?: number
  /** Sound id played when the move starts. */
  sound?: string
  /** Sound id played when it lands, instead of the audio settings' `hit`. */
  hitSound?: string
}

export type MoveSet = Record<string, MoveDef>

export type MovePhase = 'startup' | 'active' | 'recovery'

export const moveDuration = (m: MoveDef): number => m.startup + m.active + m.recovery

export const cancelTime = (m: MoveDef): number => m.cancelFrom ?? m.startup + m.active

/** The phase `time` seconds into the move, or null once it's over. */
export const movePhase = (m: MoveDef, time: number): MovePhase | null => {
  if (time + EPSILON < m.startup) return 'startup'
  if (time + EPSILON < m.startup + m.active) return 'active'
  if (time + EPSILON < moveDuration(m)) return 'recovery'
  return null
}

/** One fighter's current move. Mutable; stepped by the fighter's attack system. */
export interface MoveRunner {
  /** Current move name, or null when free. */
  move: string | null
  /** Seconds since the current move started. */
  time: number
  /** Increments each time a move starts; combat uses it for one-hit-per-move. */
  instance: number
  /** An attack press during the move, waiting for the cancel window. */
  buffered: boolean
  /** Last step's button state, for press (edge) detection. */
  held: boolean
}

export const createMoveRunner = (): MoveRunner => ({
  move: null,
  time: 0,
  instance: 0,
  buffered: false,
  held: false,
})

export const startMove = (r: MoveRunner, name: string): void => {
  r.move = name
  r.time = 0
  r.instance++
  r.buffered = false
}

/** Stops the current move (e.g. the fighter was hit). */
export const interruptMove = (r: MoveRunner): void => {
  r.move = null
  r.time = 0
  r.buffered = false
}

export const isMoveActive = (r: MoveRunner, moves: MoveSet): boolean =>
  r.move !== null && movePhase(moves[r.move], r.time) === 'active'

export type MoveEvent = 'started' | 'ended' | null

/**
 * Advances the current move by `dt` and handles the attack button: a press
 * while free starts `first`; a press during a move is buffered and cancels into
 * the move's `next` once the cancel window opens. A held button doesn't repeat.
 * A move started this step has `time` 0, so a zero-startup move hits on the
 * step it starts.
 */
export const stepMoveRunner = (
  r: MoveRunner,
  held: boolean,
  dt: number,
  moves: MoveSet,
  first: string
): MoveEvent => {
  const pressed = held && !r.held
  r.held = held

  if (r.move !== null) {
    const m = moves[r.move]
    r.time += dt
    if (pressed && m.next) r.buffered = true
    if (r.buffered && m.next && r.time + EPSILON >= cancelTime(m)) {
      startMove(r, m.next)
      return 'started'
    }
    if (movePhase(m, r.time) === null) {
      interruptMove(r)
      return 'ended'
    }
    return null
  }

  if (pressed) {
    startMove(r, first)
    return 'started'
  }
  return null
}

/** Problems in a move set and the moves that reference it (empty when valid). */
export const validateMoves = (moves: MoveSet, referenced: string[]): string[] => {
  const errors: string[] = []
  for (const name of referenced) if (!moves[name]) errors.push(`unknown move "${name}"`)
  for (const [name, m] of Object.entries(moves)) {
    if (m.startup < 0 || m.active <= 0 || m.recovery < 0) errors.push(`${name}: bad phase timing`)
    if (m.next && !moves[m.next]) errors.push(`${name}: next "${m.next}" doesn't exist`)
    const c = cancelTime(m)
    if (c < m.startup || c > moveDuration(m)) errors.push(`${name}: cancelFrom outside the move`)
  }
  return errors
}
