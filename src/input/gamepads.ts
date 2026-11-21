// The browser side of gamepads: which pad is player 1, reading it, and
// rumble. Both the scene's InputManager and menu navigation read pads
// through `readPad`, each keeping its own edges. The pure parts are in
// src/sim/gamepad.ts.

import { choosePad, padInputs, type PadLike } from '../sim/gamepad'
import { labelSetFor } from '../sim/input'
import { useGameStore } from '../store/gameStore'
import { loadPadPrefs } from './prefs'

/** The pad driving player 1: the first to press something. */
let active: number | null = null

const allPads = (): readonly (PadLike | null)[] => {
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

/** Player 1's pad and the inputs it has down now. A pad that presses something becomes the last used device. */
export const readPad = (): PadRead => {
  const pad = choosePad(allPads(), active)
  // Keep `active` when its pad goes away, so a disconnect can be told apart and the pad can come back.
  if (!pad) return { pad: null, inputs: new Set() }
  active = pad.index
  const inputs = padInputs(pad)
  if (inputs.size > 0) useGameStore.getState().setInputDevice('gamepad', labelSetFor(pad.id))
  return { pad, inputs }
}

/** The index of player 1's pad, if one has been used. */
export const activePadIndex = (): number | null => active

interface Actuator {
  playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>
}

/** A short rumble on player 1's pad, if it has a motor and the player hasn't turned it off. */
export const rumble = (strength: number, seconds: number): void => {
  if (strength <= 0 || active === null || !loadPadPrefs().rumble) return
  const pad = allPads().find((p) => p?.index === active) as (PadLike & { vibrationActuator?: Actuator }) | undefined
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
