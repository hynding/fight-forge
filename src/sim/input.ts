// Input bindings: which keys drive which action. Bindings come from the
// content (`input.bindings`), with the player's own remapping layered on top.
// Keys are `KeyboardEvent.key` values, lowercased (so Shift+W and Caps Lock
// still map). Pure TS.

export const INPUT_ACTIONS = [
  'left',
  'right',
  'forward',
  'backward',
  'jump',
  'attack',
  'block',
  'dodge',
  'pause',
  'hitboxes',
] as const

export type InputAction = (typeof INPUT_ACTIONS)[number]

/** Action to keys. Every action has at least one key. */
export type Bindings = Record<InputAction, string[]>

/** The player's remapping: actions they changed, each to its full new key list. */
export type BindingOverride = Partial<Bindings>

export const normalizeKey = (key: string): string => key.toLowerCase()

/** Pack bindings with the player's changes on top. A key the player moved is taken off other actions. */
export const mergeBindings = (base: Bindings, override: BindingOverride = {}): Bindings => {
  const moved = new Set(Object.values(override).flat().map(normalizeKey))
  const out = {} as Bindings
  for (const action of INPUT_ACTIONS) {
    const own = override[action]
    out[action] = own ? own.map(normalizeKey) : base[action].map(normalizeKey).filter((k) => !moved.has(k))
  }
  return out
}

/** Key to action. If a key is bound twice, the first action in INPUT_ACTIONS order wins. */
export const keyMap = (bindings: Bindings): ReadonlyMap<string, InputAction> => {
  const map = new Map<string, InputAction>()
  for (const action of INPUT_ACTIONS) for (const key of bindings[action]) if (!map.has(key)) map.set(normalizeKey(key), action)
  return map
}

/** Keys bound to more than one action. */
export const bindingConflicts = (bindings: Bindings): { key: string; actions: InputAction[] }[] => {
  const byKey = new Map<string, InputAction[]>()
  for (const action of INPUT_ACTIONS)
    for (const key of bindings[action]) byKey.set(normalizeKey(key), [...(byKey.get(normalizeKey(key)) ?? []), action])
  return [...byKey].filter(([, actions]) => actions.length > 1).map(([key, actions]) => ({ key, actions }))
}

/** Rebind one action to a single key, taking that key off any other action. Returns the new override. */
export const rebind = (override: BindingOverride, base: Bindings, action: InputAction, key: string): BindingOverride => {
  const k = normalizeKey(key)
  const current = mergeBindings(base, override)
  const next: BindingOverride = { ...override, [action]: [k] }
  for (const other of INPUT_ACTIONS)
    if (other !== action && current[other].includes(k)) next[other] = current[other].filter((x) => x !== k)
  return next
}

const LABELS: Record<string, string> = {
  ' ': 'SPACE',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'ESC',
  shift: 'SHIFT',
  control: 'CTRL',
  alt: 'ALT',
  enter: 'ENTER',
  tab: 'TAB',
}

/** How a key is shown on screen. */
export const keyLabel = (key: string): string => LABELS[normalizeKey(key)] ?? key.toUpperCase()

/** All of an action's keys for display, e.g. "A / ←", or "—" if unbound. */
export const actionLabel = (bindings: Bindings, action: InputAction): string =>
  bindings[action].length ? bindings[action].map(keyLabel).join(' / ') : '—'

/** The one-line controls help, from each action's first key. */
export const controlsHelp = (b: Bindings, combo = false): string => {
  const k = (a: InputAction) => (b[a].length ? keyLabel(b[a][0]) : '—')
  return [
    `${k('left')}/${k('right')} - Move (double-tap to run)`,
    `${k('forward')}/${k('backward')} - Depth`,
    `${k('jump')} - Jump`,
    `${k('attack')} - Attack${combo ? ' (tap for combo)' : ''}`,
    `${k('block')} - Block`,
    `${k('dodge')} - Dodge`,
    `${k('pause')} - Pause`,
  ].join(' | ')
}

/** Display names for the remapping screen. */
export const ACTION_NAMES: Record<InputAction, string> = {
  left: 'Move left',
  right: 'Move right',
  forward: 'Move back (depth)',
  backward: 'Move front (depth)',
  jump: 'Jump',
  attack: 'Attack',
  block: 'Block',
  dodge: 'Dodge',
  pause: 'Pause',
  hitboxes: 'Hitbox overlay',
}
