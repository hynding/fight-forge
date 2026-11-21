// The action sampler: raw device inputs in, one ActionFrame per sim step out.
// Inputs have stable names (`key:j`; later `mouse:left`, `pad:a`). Sources
// report downs and ups as they happen; `sampleActions` maps them to actions
// through the bindings once per fixed step. Edges are latched between steps,
// so a tap that goes down and up between two steps still counts as a press.
// Pure TS.

import { INPUT_ACTIONS, normalizeKey, type Bindings, type InputAction } from './input'
import type { Vec2 } from './fighter'

export type InputDevice = 'keyboard' | 'mouse' | 'gamepad'

/** Input name to action. */
export type InputMap = ReadonlyMap<string, InputAction>

/** The input name for a keyboard key (`KeyboardEvent.key`, lowercased). */
export const keyInput = (key: string): string => `key:${normalizeKey(key)}`

/** Input name to action for the keyboard bindings. A key bound twice goes to the first action in INPUT_ACTIONS order. */
export const inputMap = (bindings: Bindings): InputMap => {
  const map = new Map<string, InputAction>()
  for (const action of INPUT_ACTIONS)
    for (const key of bindings[action]) {
      const input = keyInput(key)
      if (!map.has(input)) map.set(input, action)
    }
  return map
}

export type ActionFlags = Record<InputAction, boolean>

/** One sim step's view of the controls. */
export interface ActionFrame {
  /** Down at the end of the step. */
  held: ActionFlags
  /** Went down since the last step, even if already released again. */
  pressed: ActionFlags
  /** Went up since the last step (or was tapped and released within it). */
  released: ActionFlags
  /** Movement: x is left (-1) to right (1), z is forward (-1) to backward (1). */
  move: Vec2
}

const flags = (): ActionFlags => Object.fromEntries(INPUT_ACTIONS.map((a) => [a, false])) as ActionFlags

export const emptyFrame = (): ActionFrame => ({ held: flags(), pressed: flags(), released: flags(), move: { x: 0, z: 0 } })

/** Device state between steps. Mutable; fed by sources, drained by `sampleActions`. */
export interface ActionSampler {
  down: Set<string>
  /** Inputs that went down since the last sample. */
  pressedSince: Set<string>
  /** Inputs that went up since the last sample. */
  releasedSince: Set<string>
  /** Actions held at the last sample. */
  lastHeld: ActionFlags
  /** The device that last pressed something, for on-screen prompts. */
  lastDevice: InputDevice
}

export const createActionSampler = (): ActionSampler => ({
  down: new Set(),
  pressedSince: new Set(),
  releasedSince: new Set(),
  lastHeld: flags(),
  lastDevice: 'keyboard',
})

/** An input went down. A repeat of an input already down isn't a new press. */
export const inputDown = (s: ActionSampler, input: string, device: InputDevice): void => {
  if (s.down.has(input)) return
  s.down.add(input)
  s.pressedSince.add(input)
  s.lastDevice = device
}

export const inputUp = (s: ActionSampler, input: string): void => {
  if (!s.down.delete(input)) return
  s.releasedSince.add(input)
}

/** Everything up and no pending edges (window blur, or a trip to the Forge). */
export const releaseAll = (s: ActionSampler): void => {
  s.down.clear()
  s.pressedSince.clear()
  s.releasedSince.clear()
}

/** Drops presses and releases not yet sampled, keeping what's held (e.g. keys pressed while paused). */
export const dropEdges = (s: ActionSampler): void => {
  s.pressedSince.clear()
  s.releasedSince.clear()
}

/** One step's frame; clears the latched edges. */
export const sampleActions = (s: ActionSampler, map: InputMap): ActionFrame => {
  const frame = emptyFrame()
  for (const input of s.down) {
    const a = map.get(input)
    if (a) frame.held[a] = true
  }
  for (const input of s.pressedSince) {
    const a = map.get(input)
    if (a) frame.pressed[a] = true
  }
  for (const input of s.releasedSince) {
    const a = map.get(input)
    if (a) frame.released[a] = true
  }
  // Also catches keys dropped without an up (blur, the Forge).
  for (const a of INPUT_ACTIONS) if (s.lastHeld[a] && !frame.held[a]) frame.released[a] = true
  s.lastHeld = frame.held
  s.pressedSince.clear()
  s.releasedSince.clear()
  // A tap within the step counts as held for this one step.
  const on = (a: InputAction) => frame.held[a] || frame.pressed[a]
  // Opposites: forward and left win, as before.
  frame.move = { x: on('left') ? -1 : on('right') ? 1 : 0, z: on('forward') ? -1 : on('backward') ? 1 : 0 }
  return frame
}

/** The gameplay controls a fighter controller reads: each on if held, or tapped since the last step. */
export interface Controls {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
  block: boolean
  dodge: boolean
}

export const frameControls = (f: ActionFrame): Controls => {
  const on = (a: InputAction) => f.held[a] || f.pressed[a]
  return {
    forward: on('forward'),
    backward: on('backward'),
    left: on('left'),
    right: on('right'),
    jump: on('jump'),
    attack: on('attack'),
    block: on('block'),
    dodge: on('dodge'),
  }
}
