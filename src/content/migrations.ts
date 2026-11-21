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
