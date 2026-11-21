// Gamepads, the pure part: which named inputs a pad has down, the analog
// stick with a radial dead zone, and which label set to show. Works on any
// object shaped like the browser's `Gamepad`, so tests feed fake pads.

import { GAMEPAD_INPUTS } from './input'
import type { Vec2 } from './fighter'

/** The parts of the browser's `Gamepad` we read. */
export interface PadLike {
  index: number
  id: string
  mapping: string
  connected?: boolean
  buttons: readonly { pressed: boolean; value: number }[]
  axes: readonly number[]
}

/** W3C standard mapping: button index to input name. */
export const STANDARD_BUTTONS: readonly string[] = GAMEPAD_INPUTS.slice(0, 17)

/** A stick or trigger past this counts as a digital press. */
export const PAD_PRESS = 0.5

const STICKS: [string, number, number][] = [
  ['ls', 0, 1],
  ['rs', 2, 3],
]

/**
 * Every input the pad has down. A standard pad gives standard names; any
 * other pad gives raw names (`b7`, `axis2+`) and, as a best guess, the
 * standard names by position too, so the default bindings work until the
 * player remaps.
 */
export const padInputs = (pad: PadLike): Set<string> => {
  const out = new Set<string>()
  const standard = pad.mapping === 'standard'
  pad.buttons.forEach((b, i) => {
    if (!(b.pressed || b.value > PAD_PRESS)) return
    if (i < STANDARD_BUTTONS.length) out.add(STANDARD_BUTTONS[i])
    if (!standard) out.add(`b${i}`)
  })
  for (const [stick, ax, ay] of STICKS) {
    const x = pad.axes[ax] ?? 0
    const y = pad.axes[ay] ?? 0
    if (x < -PAD_PRESS) out.add(`${stick}-left`)
    if (x > PAD_PRESS) out.add(`${stick}-right`)
    if (y < -PAD_PRESS) out.add(`${stick}-up`)
    if (y > PAD_PRESS) out.add(`${stick}-down`)
  }
  if (!standard)
    pad.axes.forEach((v, i) => {
      if (v < -PAD_PRESS) out.add(`axis${i}-`)
      if (v > PAD_PRESS) out.add(`axis${i}+`)
    })
  return out
}

/**
 * The left stick as a move vector: zero inside the radial dead zone, then
 * rescaled so just past the dead zone is slow and full tilt is 1. Screen up
 * (negative Y) is into the depth (negative Z), like W.
 */
export const padStick = (pad: PadLike, deadZone: number): Vec2 => {
  const x = pad.axes[0] ?? 0
  const y = pad.axes[1] ?? 0
  const len = Math.hypot(x, y)
  if (len <= deadZone || len === 0) return { x: 0, z: 0 }
  const scaled = Math.min(1, (len - deadZone) / (1 - deadZone))
  return { x: (x / len) * scaled, z: (y / len) * scaled }
}

/** The pad that just pressed something, or the one already in use if it still exists. */
export const choosePad = (pads: readonly (PadLike | null)[], current: number | null): PadLike | null => {
  const live = pads.filter((p): p is PadLike => !!p && p.connected !== false)
  const pressing = live.find((p) => p.index !== current && padInputs(p).size > 0)
  if (current === null) return pressing ?? null
  return live.find((p) => p.index === current) ?? pressing ?? null
}

/** Inputs that went down and up between two polls. */
export const padChanges = (before: ReadonlySet<string>, now: ReadonlySet<string>): { down: string[]; up: string[] } => ({
  down: [...now].filter((n) => !before.has(n)),
  up: [...before].filter((n) => !now.has(n)),
})
