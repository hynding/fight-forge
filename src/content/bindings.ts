// The key bindings in effect: the active content's `input.bindings` with the
// player's own remapping on top. The remapping is a per-browser preference,
// kept in localStorage (it survives pack changes; actions a pack doesn't
// change keep the pack's keys).

import { INPUT_ACTIONS, keyMap, mergeBindings, normalizeKey, type BindingOverride, type Bindings, type InputAction } from '../sim/input'
import { getConfig } from './active'

const STORAGE_KEY = 'fight-forge.input-override.v1'

let cached: BindingOverride | null = null

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Keep only well-formed entries: known actions mapped to arrays of non-empty strings. */
export const sanitizeOverride = (raw: unknown): BindingOverride => {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: BindingOverride = {}
  for (const action of INPUT_ACTIONS) {
    const keys = (raw as Record<string, unknown>)[action]
    if (Array.isArray(keys) && keys.every((k) => typeof k === 'string' && k.length > 0)) out[action] = keys.map(normalizeKey)
  }
  return out
}

export const getOverride = (): BindingOverride => {
  if (cached) return cached
  try {
    cached = sanitizeOverride(JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '{}'))
  } catch {
    cached = {}
  }
  return cached
}

export const setOverride = (override: BindingOverride): void => {
  cached = sanitizeOverride(override)
  try {
    if (Object.keys(cached).length) storage()?.setItem(STORAGE_KEY, JSON.stringify(cached))
    else storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Storage full or blocked: the remapping still applies for this session.
  }
}

/** The pack's bindings, before the player's remapping. */
export const getPackBindings = (): Bindings => getConfig().input.bindings

/** The bindings in effect now. */
export const getBindings = (): Bindings => mergeBindings(getPackBindings(), getOverride())

/** The action a key event triggers under the current bindings. */
export const actionForKey = (key: string): InputAction | undefined => keyMap(getBindings()).get(normalizeKey(key))
