// The browser side of gamepads: which pad each player has, reading them, and
// rumble. Both the scene's InputManager and menu navigation read player 1's
// pad through `readPad`, each keeping its own edges. Player 2's pad is the
// one they joined with. The pure parts are in src/sim/gamepad.ts.

import { choosePad, padInputs, type PadLike } from '../sim/gamepad'
import { labelSetFor } from '../sim/input'
import { useGameStore } from '../store/gameStore'
import { loadControlPrefs } from './prefs'

/** The pad driving player 1: the first to press something. */
let active: number | null = null
/** The pad player 2 joined with, if they play on one. Kept between levels. */
let p2Pad: number | null = null

/** Every connected pad (holes are null). */
export const allPads = (): readonly (PadLike | null)[] => {
  try {
    return typeof navigator !== 'undefined' && navigator.getGamepads ? (navigator.getGamepads() as readonly (PadLike | null)[]) : []
  } catch {
    // Blocked by a permissions policy.
    return []
  }
}

export interface PadRead {
  pad: PadLike | null
  inputs: Set<string>
}

const NONE: PadRead = { pad: null, inputs: new Set() }

/** Player 1's pad and the inputs it has down now. A pad that presses something becomes the last used device. */
export const readPad = (): PadRead => {
  const pad = choosePad(allPads(), active, p2Pad === null ? undefined : new Set([p2Pad]))
  // Keep `active` when its pad goes away, so a disconnect can be told apart and the pad can come back.
  if (!pad) return NONE
  active = pad.index
  const inputs = padInputs(pad)
  if (inputs.size > 0) useGameStore.getState().setInputDevice('gamepad', labelSetFor(pad.id))
  return { pad, inputs }
}

/** The pad at `index` and the inputs it has down (nothing if it's gone). */
export const readPadAt = (index: number): PadRead => {
  const pad = allPads().find((p) => p?.index === index && p.connected !== false)
  return pad ? { pad, inputs: padInputs(pad) } : NONE
}

/** The index of a player's pad, if they have one. */
export const playerPad = (slot: number): number | null => (slot === 1 ? active : slot === 2 ? p2Pad : null)

/** Gives player 2 a pad (or takes it away with null). */
export const setPlayer2Pad = (index: number | null): void => {
  p2Pad = index
  if (index !== null && active === index) active = null
}

/** The index of player 1's pad, if one has been used. */
export const activePadIndex = (): number | null => active

interface Actuator {
  playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>
}

/** A short rumble on a player's pad, if it has a motor and the player hasn't turned it off. */
export const rumble = (strength: number, seconds: number, slot = 1): void => {
  const index = playerPad(slot)
  if (strength <= 0 || index === null || !loadControlPrefs().rumble) return
  const pad = allPads().find((p) => p?.index === index) as (PadLike & { vibrationActuator?: Actuator }) | undefined
  const motor = pad?.vibrationActuator
  if (!motor?.playEffect) return
  motor
    .playEffect('dual-rumble', {
      duration: Math.round(seconds * 1000),
      strongMagnitude: Math.min(1, strength),
      weakMagnitude: Math.min(1, strength * 0.6),
    })
    .catch(() => {
      // Some pads refuse effects; rumble is a nicety.
    })
}
