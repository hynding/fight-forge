// Input bindings: which inputs drive which action, per device. Bindings come
// from the content (`input.bindings`, one map per device), with the player's
// own remapping layered on top. Keyboard inputs are `KeyboardEvent.key`
// values, lowercased (so Shift+W and Caps Lock still map); mouse and gamepad
// inputs are the names in MOUSE_INPUTS and GAMEPAD_INPUTS. Pure TS.

export const INPUT_ACTIONS = [
  'left',
  'right',
  'forward',
  'backward',
  'jump',
  'attack',
  'block',
  'dodge',
  'heavy',
  'special',
  'grab',
  'run',
  'pause',
  'hitboxes',
] as const

/** Actions a pack can turn off (`input.actions`); turned-off ones are hidden from remapping and help. */
export const OPTIONAL_ACTIONS = ['heavy', 'special', 'grab', 'run'] as const

/** The pack's switches for optional actions and how some actions behave. */
export interface ActionSettings {
  heavy: { enabled: boolean }
  special: { enabled: boolean }
  /** `contact`: walk into a free or stunned enemy to grab it; `button`: press grab beside one. */
  grab: { enabled: boolean; trigger: 'contact' | 'button' }
  /** `doubleTap` a direction, `hold` the run button, or `both`. A stick pushed past the run threshold always runs. */
  run: { mode: 'doubleTap' | 'hold' | 'both' }
  /** `hold` to guard, or `toggle` it with a press. */
  block: { mode: 'hold' | 'toggle' }
}

/** Whether an action is in use under the pack's settings (run is a button only in hold modes, grab only for button grabs). */
export const actionEnabled = (s: ActionSettings, a: InputAction): boolean => {
  if (a === 'heavy' || a === 'special') return s[a].enabled
  if (a === 'grab') return s.grab.enabled && s.grab.trigger === 'button'
  if (a === 'run') return s.run.mode !== 'doubleTap'
  return true
}

/** The actions in use, in INPUT_ACTIONS order. */
export const enabledActions = (s: ActionSettings): InputAction[] => INPUT_ACTIONS.filter((a) => actionEnabled(s, a))

/** The optional actions in use, for the extras in on-screen help. */
export const helpExtras = (s: ActionSettings): InputAction[] => OPTIONAL_ACTIONS.filter((a) => actionEnabled(s, a))

export type InputAction = (typeof INPUT_ACTIONS)[number]

/** One device's bindings: action to inputs (keys, buttons). */
export type Bindings = Record<InputAction, string[]>

/** The player's remapping of one device: actions they changed, each to its full new input list. */
export type BindingOverride = Partial<Bindings>

export const DEVICES = ['keyboard', 'mouse', 'gamepad'] as const
export type InputDevice = (typeof DEVICES)[number]

/** Bindings for every device. */
export type DeviceBindings = Record<InputDevice, Bindings>

/** The player's remapping, per device. */
export type DeviceOverride = Partial<Record<InputDevice, BindingOverride>>

/** Mouse inputs: buttons and the wheel. */
export const MOUSE_INPUTS = ['left', 'right', 'middle', 'back', 'forward', 'wheelup', 'wheeldown'] as const

/** `MouseEvent.button` to mouse input. */
export const MOUSE_BUTTONS: readonly string[] = ['left', 'middle', 'right', 'back', 'forward']

/** Gamepad inputs, by W3C standard-mapping position (Xbox names), plus stick directions. */
export const GAMEPAD_INPUTS = [
  'a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home',
  'ls-left', 'ls-right', 'ls-up', 'ls-down', 'rs-left', 'rs-right', 'rs-up', 'rs-down',
] as const

/** A non-standard pad's raw inputs: button `b7`, axis direction `axis2+`. */
export const RAW_PAD_INPUT = /^(b\d{1,2}|axis\d{1,2}[+-])$/

export const isPadInput = (name: string): boolean => (GAMEPAD_INPUTS as readonly string[]).includes(name) || RAW_PAD_INPUT.test(name)

const PREFIX: Record<InputDevice, string> = { keyboard: 'key', mouse: 'mouse', gamepad: 'pad' }

/** The sampler's name for an input on a device: `key:j`, `mouse:left`, `pad:a`. */
export const inputName = (device: InputDevice, name: string): string => `${PREFIX[device]}:${normalizeKey(name)}`

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

/** Every device's pack bindings with the player's changes on top. */
export const mergeDeviceBindings = (base: DeviceBindings, override: DeviceOverride = {}): DeviceBindings => ({
  keyboard: mergeBindings(base.keyboard, override.keyboard),
  mouse: mergeBindings(base.mouse, override.mouse),
  gamepad: mergeBindings(base.gamepad, override.gamepad),
})

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

const MOUSE_LABELS: Record<string, string> = {
  left: 'MOUSE L',
  right: 'MOUSE R',
  middle: 'MOUSE M',
  back: 'MOUSE 4',
  forward: 'MOUSE 5',
  wheelup: 'WHEEL ↑',
  wheeldown: 'WHEEL ↓',
}

const ARROWS: Record<string, string> = { left: '←', right: '→', up: '↑', down: '↓' }

export type PadLabelSet = 'xbox' | 'playstation' | 'nintendo' | 'generic'

/** Which button names to show for a pad, from its `id`. */
export const labelSetFor = (id: string): PadLabelSet => {
  const s = id.toLowerCase()
  if (/054c|playstation|dualshock|dualsense|sony/.test(s)) return 'playstation'
  if (/057e|nintendo|switch|pro controller|joy-con/.test(s)) return 'nintendo'
  if (/045e|xbox|xinput|microsoft/.test(s)) return 'xbox'
  return 'generic'
}

const FACE: Record<PadLabelSet, Record<string, string>> = {
  xbox: {},
  generic: {},
  playstation: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', select: 'SHARE', start: 'OPTIONS', ls: 'L3', rs: 'R3', home: 'PS' },
  // Nintendo's face buttons sit in other places: the bottom one is B.
  nintendo: { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', select: '−', start: '+', ls: 'L STICK', rs: 'R STICK' },
}

/** A standard pad input's name in a label set, or undefined to use the default (Xbox) label. */
export const faceLabel = (name: string, set: PadLabelSet): string | undefined => FACE[set][name]

const padLabel = (name: string, set: PadLabelSet = 'xbox'): string => {
  const face = faceLabel(name, set)
  if (face) return face
  const stick = /^(ls|rs)-(left|right|up|down)$/.exec(name)
  if (stick) return `${stick[1].toUpperCase()} ${ARROWS[stick[2]]}`
  if (ARROWS[name]) return `D-PAD ${ARROWS[name]}`
  const raw = /^b(\d+)$/.exec(name)
  if (raw) return `BUTTON ${raw[1]}`
  const axis = /^axis(\d+)([+-])$/.exec(name)
  if (axis) return `AXIS ${axis[1]}${axis[2]}`
  return name.toUpperCase()
}

/** How an input on a device is shown on screen (pad buttons in the pad's own label set). */
export const inputLabel = (device: InputDevice, name: string, padSet: PadLabelSet = 'xbox'): string =>
  device === 'keyboard' ? keyLabel(name) : device === 'mouse' ? (MOUSE_LABELS[name] ?? name.toUpperCase()) : padLabel(name, padSet)

/** All of an action's keys for display, e.g. "A / ←", or "—" if unbound. */
export const actionLabel = (bindings: Bindings, action: InputAction, device: InputDevice = 'keyboard', padSet: PadLabelSet = 'xbox'): string =>
  bindings[action].length ? bindings[action].map((k) => inputLabel(device, k, padSet)).join(' / ') : '—'

const EXTRA_HELP: [InputAction, string][] = [
  ['heavy', 'Heavy'],
  ['special', 'Special'],
  ['run', 'Run'],
]

/** Help for the optional actions in use, after the basics. */
const extraHelp = (k: (a: InputAction) => string, extra: readonly InputAction[]): string[] =>
  EXTRA_HELP.filter(([a]) => extra.includes(a)).map(([a, name]) => `${k(a)} - ${name}`)

/** The one-line controls help, from each action's first key; `extra` lists the optional actions in use. */
export const controlsHelp = (b: Bindings, combo = false, extra: readonly InputAction[] = []): string => {
  const k = (a: InputAction) => (b[a].length ? keyLabel(b[a][0]) : '—')
  return [
    `${k('left')}/${k('right')} - Move${extra.includes('run') ? '' : ' (double-tap to run)'}`,
    `${k('forward')}/${k('backward')} - Depth`,
    `${k('jump')} - Jump`,
    `${k('attack')} - Attack${combo ? ' (tap for combo)' : ''}`,
    ...extraHelp(k, extra.filter((a) => a !== 'run')),
    `${k('block')} - Block`,
    `${k('dodge')} - Dodge`,
    ...extraHelp(k, extra.filter((a) => a === 'run')),
    `${k('pause')} - Pause`,
  ].join(' | ')
}

/** The help line for a controller: each action's first button, movement as the stick. */
export const padHelp = (b: Bindings, padSet: PadLabelSet = 'xbox', combo = false, extra: readonly InputAction[] = []): string => {
  const k = (a: InputAction) => (b[a].length ? padLabel(b[a][0], padSet) : '—')
  return [
    'Stick / D-pad - Move (push all the way to run)',
    `${k('jump')} - Jump`,
    `${k('attack')} - Attack${combo ? ' (tap for combo)' : ''}`,
    ...extraHelp(k, extra.filter((a) => a !== 'run')),
    `${k('block')} - Block`,
    `${k('dodge')} - Dodge`,
    `${k('pause')} - Pause`,
  ].join(' | ')
}

/** An action's first input on the device last used (keyboard for keyboard and mouse), for prompts like "J: pick up". */
export const promptLabel = (all: DeviceBindings, action: InputAction, device: InputDevice, padSet: PadLabelSet = 'xbox'): string => {
  const d = device === 'gamepad' ? 'gamepad' : 'keyboard'
  const first = all[d][action][0]
  return first === undefined ? '—' : inputLabel(d, first, padSet)
}

/** The help line for the device last used: the controller's, or the keyboard's for keyboard and mouse. */
export const deviceHelp = (
  all: DeviceBindings,
  device: InputDevice,
  padSet: PadLabelSet = 'xbox',
  combo = false,
  extra: readonly InputAction[] = []
): string => (device === 'gamepad' ? padHelp(all.gamepad, padSet, combo, extra) : controlsHelp(all.keyboard, combo, extra))

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
  heavy: 'Heavy attack',
  special: 'Special',
  grab: 'Grab',
  run: 'Run (hold)',
  pause: 'Pause',
  hitboxes: 'Hitbox overlay',
}
