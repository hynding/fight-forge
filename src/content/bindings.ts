// The bindings in effect: the active content's `input.bindings` (one map per
// device) with the player's own remapping on top. The remapping is a
// per-browser preference, kept in localStorage per device (it survives pack
// changes; actions a pack doesn't change keep the pack's inputs).

import {
  DEVICES,
  INPUT_ACTIONS,
  MOUSE_INPUTS,
  isPadInput,
  keyMap,
  mergeDeviceBindings,
  normalizeKey,
  type BindingOverride,
  type Bindings,
  type DeviceBindings,
  type DeviceOverride,
  type InputAction,
  type InputDevice,
} from '../sim/input'
import { getConfig } from './active'

const STORAGE_KEY = 'fight-forge.input-override.v2'
/** Keyboard-only remapping from before per-device bindings; read once and moved into `keyboard`. */
const STORAGE_KEY_V1 = 'fight-forge.input-override.v1'

let cached: DeviceOverride | null = null

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const VALID: Record<InputDevice, (name: string) => boolean> = {
  keyboard: (k) => k.length > 0,
  mouse: (b) => (MOUSE_INPUTS as readonly string[]).includes(b),
  gamepad: isPadInput,
}

/** One device's override, keeping only known actions mapped to arrays of valid inputs. */
export const sanitizeBindingOverride = (raw: unknown, device: InputDevice = 'keyboard'): BindingOverride => {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: BindingOverride = {}
  for (const action of INPUT_ACTIONS) {
    const names = (raw as Record<string, unknown>)[action]
    if (Array.isArray(names) && names.every((k) => typeof k === 'string' && VALID[device](normalizeKey(k)))) out[action] = names.map(normalizeKey)
  }
  return out
}

/** The whole override, dropping unknown devices and empty ones. */
export const sanitizeOverride = (raw: unknown): DeviceOverride => {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: DeviceOverride = {}
  for (const device of DEVICES) {
    const o = sanitizeBindingOverride((raw as Record<string, unknown>)[device], device)
    if (Object.keys(o).length) out[device] = o
  }
  return out
}

const parse = (text: string | null | undefined): unknown => {
  try {
    return JSON.parse(text ?? 'null')
  } catch {
    return null
  }
}

export const getOverride = (): DeviceOverride => {
  if (cached) return cached
  const store = storage()
  const v2 = store?.getItem(STORAGE_KEY)
  if (v2 != null) cached = sanitizeOverride(parse(v2))
  else {
    // An older remapping was keys only.
    const keyboard = sanitizeBindingOverride(parse(store?.getItem(STORAGE_KEY_V1)))
    cached = {}
    if (Object.keys(keyboard).length) setOverride({ keyboard })
    try {
      store?.removeItem(STORAGE_KEY_V1)
    } catch {
      // Blocked storage: nothing to clean up.
    }
  }
  return cached ?? {}
}

/** Read the override from storage again on next use (a fresh page load, in tests). */
export const reloadOverride = (): void => {
  cached = null
}

export const setOverride = (override: DeviceOverride): void => {
  cached = sanitizeOverride(override)
  try {
    if (Object.keys(cached).length) storage()?.setItem(STORAGE_KEY, JSON.stringify(cached))
    else storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Storage full or blocked: the remapping still applies for this session.
  }
}

/** Replace one device's remapping (an empty one resets that device). */
export const setDeviceOverride = (device: InputDevice, override: BindingOverride): void =>
  setOverride({ ...getOverride(), [device]: override })

/** The pack's bindings, before the player's remapping. */
export const getPackBindings = (): DeviceBindings => getConfig().input.bindings

/** The bindings in effect now. */
export const getBindings = (): DeviceBindings => mergeDeviceBindings(getPackBindings(), getOverride())

/** The action a key event triggers under the current bindings. */
export const actionForKey = (key: string): InputAction | undefined => keyMap(getBindings().keyboard).get(normalizeKey(key))

/** Player 2's keyboard map in effect (the pack's `input.keyboard2`; the menu's remapping comes with CO3). */
export const getKeyboard2 = (): Bindings => getConfig().input.keyboard2
