// Pack format versions. Every pack says which `schemaVersion` it was written
// for; older packs are upgraded step by step before validation, so packs made
// with an earlier build keep loading. When the schema changes incompatibly:
// bump SCHEMA_VERSION in schemas.ts and add `MIGRATIONS[old]` that rewrites a
// pack from `old` to `old + 1` (pure JSON in, JSON out), with a test.

import { SCHEMA_VERSION } from './schemas'

type Json = Record<string, unknown>

/** `MIGRATIONS[n]` upgrades a pack from schemaVersion n to n + 1. */
export type MigrationTable = Readonly<Record<number, (pack: Json) => Json>>

const DEFAULT_RULES_V2 = { maxSimultaneousAttackers: 1, friendlyFire: false, difficulty: { damageTaken: 1, enemyHealth: 1 } }

const ACTIONS_V4 = ['left', 'right', 'forward', 'backward', 'jump', 'attack', 'block', 'dodge', 'pause', 'hitboxes']
const deviceMapV4 = (bound: Record<string, string[]>) => Object.fromEntries(ACTIONS_V4.map((a) => [a, bound[a] ?? []]))
const MOUSE_V4 = deviceMapV4({ attack: ['left'], block: ['right'] })
const GAMEPAD_V4 = deviceMapV4({
  left: ['left', 'ls-left'],
  right: ['right', 'ls-right'],
  forward: ['up', 'ls-up'],
  backward: ['down', 'ls-down'],
  jump: ['a'],
  attack: ['x'],
  block: ['lb', 'lt'],
  dodge: ['rb', 'rt'],
  pause: ['start'],
})

const NEW_INPUTS_V7: Record<string, Record<string, string[]>> = {
  keyboard: { heavy: ['l'], special: ['i'], run: ['q'] },
  mouse: { heavy: [], special: [], run: [] },
  gamepad: { heavy: ['y'], special: ['b'], run: ['ls'] },
}
const ACTIONS_V7 = { heavy: { enabled: true }, special: { enabled: true }, run: { mode: 'both' }, block: { mode: 'hold' } }

const NEW_INPUTS_V8: Record<string, Record<string, string[]>> = { keyboard: { grab: ['o'] }, mouse: { grab: [] }, gamepad: { grab: ['rs'] } }
const GRAB_TUNING_V8 = { range: 0.15, depthTolerance: 0.4, contactTime: 0.2, holdTime: 2.5, cooldown: 0.6, releasePush: 3 }

/** Adds each device's default inputs for new actions, skipping inputs the device already uses. */
const addInputs = (bindings: Record<string, Record<string, string[]>>, added: Record<string, Record<string, string[]>>) => {
  const next = { ...bindings }
  for (const [device, defaults] of Object.entries(added)) {
    const map = { ...(next[device] ?? {}) }
    const used = new Set(Object.values(map).flat())
    for (const [action, inputs] of Object.entries(defaults)) if (!(action in map)) map[action] = inputs.filter((i) => !used.has(i))
    next[device] = map
  }
  return next
}

export const MIGRATIONS: MigrationTable = {
  // v2: the attacker limit moved from `enemy` to `rules`, which also gained
  // friendly fire and difficulty; key bindings arrived as `input` (a pack
  // without it inherits the default pack's).
  1: (pack) => {
    const settings = { ...((pack.settings as Json | undefined) ?? {}) }
    const enemy = settings.enemy as Json | undefined
    const attackers = enemy?.maxSimultaneousAttackers
    if (enemy) {
      const rest = { ...enemy }
      delete rest.maxSimultaneousAttackers
      settings.enemy = rest
    }
    if (settings.rules)
      settings.rules = {
        ...DEFAULT_RULES_V2,
        ...(typeof attackers === 'number' ? { maxSimultaneousAttackers: attackers } : {}),
        ...(settings.rules as Json),
      }
    return pack.settings === undefined ? pack : { ...pack, settings }
  },
  // v3: every level names a theme. Older levels get the base pack's "default" theme.
  2: (pack) =>
    Array.isArray(pack.levels)
      ? { ...pack, levels: pack.levels.map((l: unknown) => (typeof l === 'object' && l !== null && !('theme' in l) ? { ...l, theme: 'default' } : l)) }
      : pack,
  // v4: bindings are per device. The old key map becomes `keyboard`; mouse and
  // gamepad get the defaults of the time.
  3: (pack) => {
    const settings = pack.settings as Json | undefined
    const input = settings?.input as Json | undefined
    if (!input || typeof input.bindings !== 'object' || input.bindings === null) return pack
    return {
      ...pack,
      settings: { ...settings, input: { ...input, bindings: { keyboard: input.bindings, mouse: MOUSE_V4, gamepad: GAMEPAD_V4 } } },
    }
  },
  // v5: analog stick tuning in `input`, controller rumble in `feel`.
  4: (pack) => {
    const settings = pack.settings as Json | undefined
    if (!settings || (!settings.input && !settings.feel)) return pack
    const next = { ...settings }
    if (settings.input) next.input = { analog: { deadZone: 0.2, runThreshold: 0.85 }, ...(settings.input as Json) }
    if (settings.feel)
      next.feel = { rumble: { enabled: true, base: 0.25, perDamage: 0.02, max: 0.8, duration: 0.15, dealt: 0.4, ko: 0.6 }, ...(settings.feel as Json) }
    return { ...pack, settings: next }
  },
  // v6: the player's three attack slots became a moveset (air, running, then
  // the light combo, which is how they were picked), and `input` gained the chord window and turn grace.
  5: (pack) => {
    const settings = pack.settings as Json | undefined
    if (!settings || (!settings.player && !settings.input)) return pack
    const next = { ...settings }
    const player = settings.player as Json | undefined
    if (player && !('moveset' in player)) {
      const { lightAttack, jumpAttack, dashAttack, ...rest } = player
      next.player = {
        ...rest,
        moveset: [
          { action: 'attack', when: 'air', move: jumpAttack },
          { action: 'attack', when: 'running', move: dashAttack },
          { action: 'attack', move: lightAttack },
        ],
      }
    }
    if (settings.input) next.input = { chordWindow: 0.06, turnGrace: 0.12, ...(settings.input as Json) }
    return { ...pack, settings: next }
  },
  // v7: heavy, special and run actions (each device gets the default inputs
  // the pack doesn't already use), `input.actions`, and the special meter in `rules`.
  6: (pack) => {
    const settings = pack.settings as Json | undefined
    if (!settings || (!settings.input && !settings.rules)) return pack
    const next = { ...settings }
    const input = settings.input as Json | undefined
    if (input) {
      const bindings = addInputs(input.bindings as Record<string, Record<string, string[]>>, NEW_INPUTS_V7)
      next.input = { actions: ACTIONS_V7, ...input, bindings }
    }
    if (settings.rules) next.rules = { meter: { max: 100, start: 0, perDamageDealt: 1, perDamageTaken: 0.5 }, ...(settings.rules as Json) }
    return { ...pack, settings: next }
  },
  // v8: grabs and throws: a grab action (button grabs; contact grabs need no
  // button), `input.actions.grab`, and grab tuning in `actions`.
  7: (pack) => {
    const settings = pack.settings as Json | undefined
    if (!settings || (!settings.input && !settings.actions)) return pack
    const next = { ...settings }
    const input = settings.input as Json | undefined
    if (input) {
      const actions = { ...(input.actions as Json), grab: { enabled: true, trigger: 'contact' } }
      next.input = { ...input, actions, bindings: addInputs(input.bindings as Record<string, Record<string, string[]>>, NEW_INPUTS_V8) }
    }
    if (settings.actions) next.actions = { ...(settings.actions as Json), grab: GRAB_TUNING_V8 }
    return { ...pack, settings: next }
  },
  // v9: bosses. Enemy `attacks`, the `boss` block and archetype `farReach` are new and optional.
  8: (pack) => pack,
}

export type MigrationResult = { ok: true; value: unknown } | { ok: false; message: string }

/**
 * Upgrade a pack to `target`. Anything that isn't an object with a whole-number
 * `schemaVersion` is passed through for the schema to report.
 */
export const migratePack = (
  input: unknown,
  migrations: MigrationTable = MIGRATIONS,
  target: number = SCHEMA_VERSION
): MigrationResult => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: true, value: input }
  let pack = input as Json
  const from = pack.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from)) return { ok: true, value: input }
  if (from > target)
    return {
      ok: false,
      message: `made for schema version ${from}, but this build reads up to ${target}; update the game to load it`,
    }
  for (let v = from; v < target; v++) {
    const step = migrations[v]
    if (!step) return { ok: false, message: `no migration from schema version ${v} to ${v + 1}` }
    pack = { ...step(pack), schemaVersion: v + 1 }
  }
  return { ok: true, value: pack }
}
