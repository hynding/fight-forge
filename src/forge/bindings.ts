// Editing a pack's key bindings in the Forge (the pack's defaults, not the
// player's own remapping, which lives in the browser).

import { INPUT_ACTIONS, normalizeKey, type Bindings, type InputAction } from '../sim/input'

/** Add a key to an action, taking it off any other action so no key does two things. */
export const bindKey = (bindings: Bindings, action: InputAction, key: string): Bindings => {
  const k = normalizeKey(key)
  const out = {} as Bindings
  for (const a of INPUT_ACTIONS) {
    const keys = (bindings[a] ?? []).filter((x) => normalizeKey(x) !== k)
    out[a] = a === action ? [...keys, k] : keys
  }
  return out
}

/** Take a key off an action. */
export const unbindKey = (bindings: Bindings, action: InputAction, key: string): Bindings => ({
  ...bindings,
  [action]: (bindings[action] ?? []).filter((x) => x !== key),
})
