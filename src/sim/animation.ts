// Picks which animation clip a model plays for a fighter state. The fighter
// state machine drives animation, never the other way round: gameplay
// (hitboxes, timing) never depends on the art.

import type { FighterStateName } from './fighter'

/** A clip name, or a name with a playback speed multiplier. */
export type ClipRef = string | { name: string; speed?: number }

/** Fighter state to clip. Missing states fall back (see `STATE_FALLBACK`). */
export type ClipMap = Partial<Record<FighterStateName, ClipRef>>

/** Where a state looks when the clip map has no usable clip for it. */
export const STATE_FALLBACK: Partial<Record<FighterStateName, FighterStateName>> = {
  walk: 'idle',
  run: 'walk',
  jump: 'idle',
  attack: 'idle',
  block: 'idle',
  dodge: 'walk',
  hitstun: 'idle',
  knockdown: 'hitstun',
  getup: 'idle',
  grab: 'idle',
  held: 'hitstun',
}

/** States whose clip plays once and holds its last frame instead of looping. */
export const ONE_SHOT_STATES: ReadonlySet<FighterStateName> = new Set<FighterStateName>([
  'attack',
  'jump',
  'hitstun',
  'knockdown',
  'getup',
  'dead',
])

export interface ResolvedClip {
  name: string
  speed: number
  loop: boolean
}

/**
 * The clip to play for `state`, following fallbacks until a mapped clip that
 * exists in `available` is found. Returns null when nothing matches (the model
 * then keeps its bind pose or current clip).
 */
export const resolveClip = (
  state: FighterStateName,
  clips: ClipMap,
  available: ReadonlySet<string>
): ResolvedClip | null => {
  const seen = new Set<FighterStateName>()
  let s: FighterStateName | undefined = state
  while (s && !seen.has(s)) {
    seen.add(s)
    const ref = clips[s]
    if (ref !== undefined) {
      const name = typeof ref === 'string' ? ref : ref.name
      const speed = typeof ref === 'string' ? 1 : (ref.speed ?? 1)
      if (available.has(name)) {
        // Looping follows the state whose clip was found: an attack that falls
        // back to the idle clip loops it like idle.
        return { name, speed, loop: !ONE_SHOT_STATES.has(s) }
      }
    }
    s = STATE_FALLBACK[s]
  }
  return null
}

/**
 * Like `resolveClip`, but an attack plays its move's own clip (once) when the
 * model has it, so each move in a combo can look different.
 */
export const resolveFighterClip = (
  state: FighterStateName,
  moveClip: ClipRef | undefined,
  clips: ClipMap,
  available: ReadonlySet<string>
): ResolvedClip | null => {
  if (state === 'attack' && moveClip !== undefined) {
    const name = typeof moveClip === 'string' ? moveClip : moveClip.name
    const speed = typeof moveClip === 'string' ? 1 : (moveClip.speed ?? 1)
    if (available.has(name)) return { name, speed, loop: false }
  }
  return resolveClip(state, clips, available)
}
