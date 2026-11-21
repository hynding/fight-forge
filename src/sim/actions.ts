// The action sampler: raw device inputs in, one ActionFrame per sim step out.
// Inputs have stable names (`key:j`; later `mouse:left`, `pad:a`). Sources
// report downs and ups as they happen; `sampleActions` maps them to actions
// through the bindings once per fixed step. Edges are latched between steps,
// so a tap that goes down and up between two steps still counts as a press.
// Pure TS.

import { DEVICES, INPUT_ACTIONS, inputName, type DeviceBindings, type InputAction, type InputDevice } from './input'
import type { Vec2 } from './fighter'

export type { InputDevice }

/** Input name to action. */
export type InputMap = ReadonlyMap<string, InputAction>

/** The input name for a keyboard key (`KeyboardEvent.key`, lowercased). */
export const keyInput = (key: string): string => inputName('keyboard', key)

/** Input name to action for every device. An input bound twice goes to the first action in INPUT_ACTIONS order. */
export const inputMap = (bindings: DeviceBindings): InputMap => {
  const map = new Map<string, InputAction>()
  for (const device of DEVICES)
    for (const action of INPUT_ACTIONS)
      for (const name of bindings[device][action]) {
        const input = inputName(device, name)
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
  /** True when `move` came from an analog stick (its length is how far it's pushed). */
  analog: boolean
}

const flags = (): ActionFlags => Object.fromEntries(INPUT_ACTIONS.map((a) => [a, false])) as ActionFlags

/** The left stick's digital directions, which the analog vector replaces for movement. */
const STICK_INPUT = /^pad:ls-/

export const emptyFrame = (): ActionFrame => ({ held: flags(), pressed: flags(), released: flags(), move: { x: 0, z: 0 }, analog: false })

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
  /** Inputs that don't count until released (held while the game was frozen). */
  ignored: Set<string>
  /** The analog stick's move vector (zero inside the dead zone), set by the gamepad source. */
  stick: Vec2
}

export const createActionSampler = (): ActionSampler => ({
  down: new Set(),
  pressedSince: new Set(),
  releasedSince: new Set(),
  lastHeld: flags(),
  lastDevice: 'keyboard',
  ignored: new Set(),
  stick: { x: 0, z: 0 },
})

/** An input went down. A repeat of an input already down isn't a new press. */
export const inputDown = (s: ActionSampler, input: string, device: InputDevice): void => {
  if (s.down.has(input)) return
  s.down.add(input)
  s.pressedSince.add(input)
  s.lastDevice = device
}

export const inputUp = (s: ActionSampler, input: string): void => {
  s.ignored.delete(input)
  if (!s.down.delete(input)) return
  s.releasedSince.add(input)
}

/** Everything up and no pending edges (window blur, or a trip to the Forge). */
export const releaseAll = (s: ActionSampler): void => {
  s.down.clear()
  s.ignored.clear()
  s.stick = { x: 0, z: 0 }
  s.pressedSince.clear()
  s.releasedSince.clear()
}

/** Drops presses and releases not yet sampled, keeping what's held (e.g. keys pressed while paused). */
export const dropEdges = (s: ActionSampler): void => {
  s.pressedSince.clear()
  s.releasedSince.clear()
}

/**
 * Drops pending edges and ignores everything held now until it's released,
 * so a button held through a pause or a menu (A on RESUME) doesn't act when
 * the fight carries on.
 */
export const suppressHeld = (s: ActionSampler): void => {
  dropEdges(s)
  for (const input of s.down) s.ignored.add(input)
}

/** One step's frame; clears the latched edges. */
export const sampleActions = (s: ActionSampler, map: InputMap): ActionFrame => {
  const frame = emptyFrame()
  for (const input of s.down) {
    if (s.ignored.has(input)) continue
    const a = map.get(input)
    if (a) frame.held[a] = true
  }
  const pressed = [...s.pressedSince]
  for (const input of pressed) {
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
  const digital = (on: (a: InputAction) => boolean): Vec2 => ({
    x: on('left') ? -1 : on('right') ? 1 : 0,
    z: on('forward') ? -1 : on('backward') ? 1 : 0,
  })
  frame.move = digital(on)
  if (s.stick.x !== 0 || s.stick.z !== 0) {
    // The stick moves with its tilt, unless another direction (keys, d-pad)
    // is in use; its own digital directions (`ls-left`…) don't count here.
    const other = flags()
    for (const input of [...s.down, ...pressed]) {
      const a = map.get(input)
      if (a && !STICK_INPUT.test(input) && !s.ignored.has(input)) other[a] = true
    }
    const keys = digital((a) => other[a])
    if (keys.x === 0 && keys.z === 0) {
      frame.move = { ...s.stick }
      frame.analog = true
    } else frame.move = keys
  }
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
