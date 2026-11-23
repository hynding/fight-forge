// Two players on one machine, the pure part: whose input a key or a pad
// press is, when a press joins player 2, where a player drops back in, and
// how much tougher enemies are with two. The InputManager, the store and
// LevelDirector use it.

import { INPUT_ACTIONS, inputName, type Bindings, type InputAction } from './input'
import type { InputMap } from './actions'

/** What player 2 plays with: the second keyboard map or a gamepad. */
export type P2Controls = 'keyboard2' | 'gamepad'

/** The presses that join a game (or rejoin, spending a continue). */
export const JOIN_ACTIONS: readonly InputAction[] = ['attack', 'pause']

/** Player 2's keyboard map as input names (`key:1` → attack). */
export const keyboard2Map = (keys: Bindings): InputMap => {
  const map = new Map<string, InputAction>()
  for (const action of INPUT_ACTIONS)
    for (const key of keys[action]) {
      const input = inputName('keyboard', key)
      if (!map.has(input)) map.set(input, action)
    }
  return map
}

/** `map` without the inputs `taken` uses: player 1's map while player 2 plays on the keyboard. */
export const withoutInputs = (map: InputMap, taken: InputMap): InputMap =>
  new Map([...map].filter(([input]) => !taken.has(input)))

/**
 * Whose key it is: player 2's while they play on the second keyboard map,
 * else player 1's if their map has it, else `join` when it's player 2's
 * attack or pause (a way in), else nobody's.
 */
export const routeKey = (input: string, p1: InputMap, p2: InputMap, p2OnKeys: boolean): 1 | 2 | 'join' | null => {
  if (p2OnKeys && p2.has(input)) return 2
  if (p1.has(input)) return 1
  const action = p2.get(input)
  if (!p2OnKeys && action && JOIN_ACTIONS.includes(action)) return 'join'
  return null
}

export interface PadSeats {
  /** Player 1's pad index, or null before they've used one. */
  p1: number | null
  /** Player 2's pad index, or null. */
  p2: number | null
  /** Whether player 2 can join now (not in, or out of lives). */
  p2Free: boolean
  /** Player 2 is in on the second keyboard map (a controller can take them over). */
  p2OnKeys?: boolean
  /** Players expected from the start menu (1 or 2). */
  expected: number
}

/**
 * Whose a pad is when it presses `actions`. A player's own pad is theirs.
 * Otherwise the first pad used is player 1's, unless the menu chose two
 * players and player 2 hasn't joined or is on the keys (then a keyboard
 * player 1 and a friend on the pad is the likely setup). A pad nobody has,
 * pressing attack or start while player 2 can join (or is on the keys),
 * joins as player 2 (or takes player 2 onto it).
 */
export const padSeat = (index: number, actions: readonly InputAction[], seats: PadSeats): 1 | 2 | 'join' | null => {
  if (index === seats.p1) return 1
  if (index === seats.p2) return 2
  const open = seats.p2Free || !!seats.p2OnKeys
  if (seats.p1 === null && !(seats.expected >= 2 && open)) return 1
  if (open && actions.some((a) => JOIN_ACTIONS.includes(a))) return 'join'
  return null
}

/** How a join goes: a new player, a player out of lives coming back on a continue, or not at all. */
export const joinOutcome = (player: { lives: number } | undefined, continuesLeft: number): 'new' | 'continue' | null =>
  !player ? 'new' : player.lives > 0 ? null : continuesLeft > 0 ? 'continue' : null

/** Where a player drops in: beside their partner (on the side with room), or mid-screen with nobody else in. */
export const dropInX = (partnerX: number | null, cameraX: number, gap: number): number =>
  partnerX === null ? cameraX : partnerX + (partnerX > cameraX ? -gap : gap)

/** Enemy health multiplier for this many players still in. */
export const coopHealthScale = (playersIn: number, factor: number): number => (playersIn >= 2 ? factor : 1)
