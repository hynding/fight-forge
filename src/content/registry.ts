// Content registry: validates one or more packs, merges them in load order
// (a later pack adds definitions or overrides earlier ones by id), and checks
// every cross-reference, returning a readable list of errors instead of
// throwing. Pure TS, so it runs the same in the game, the editor and tests.

import { siteUrl } from './siteUrl'
import type { ZodIssue } from 'zod'
import type { GameConfig, ModelRef } from '../config/defaults'
import type { MusicDef, SoundDef } from '../audio/types'
import type { Level } from '../sim/level'
import { cancelTime, moveDuration } from '../sim/moves'
import { migratePack } from './migrations'
import { bindingConflicts, DEVICES } from '../sim/input'
import { pressKeys, triggerActions } from '../sim/moveset'
import {
  packSchema,
  type AiBehaviorDef,
  type AssetDef,
  type EnemyTypeData,
  type LevelDef,
  type ModelRefDef,
  type MoveDefData,
  type Pack,
  type PickupDefData,
  type PropDefData,
  type SoundDefData,
  type MusicDefData,
  type ThemeDefData,
  type Settings,
} from './schemas'

export interface ContentError {
  /** The pack the problem is in, when known. */
  pack?: string
  /** Where in the pack, e.g. `moves.jab.next` or `levels[0].segments[1].triggers[0].at`. */
  path: string
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: ContentError[] }

/** Kinds of definitions a reference like `move:jab` can name. */
export type ContentKind = 'move' | 'ai' | 'enemyType' | 'pickup' | 'theme' | 'prop' | 'sound' | 'music' | 'level' | 'asset'

interface KindMap {
  move: MoveDefData
  ai: AiBehaviorDef
  enemyType: EnemyTypeData
  pickup: PickupDefData
  theme: ThemeDefData
  prop: PropDefData
  sound: SoundDefData
  music: MusicDefData
  level: LevelDef
  asset: AssetDef
}

export type ContentRef<K extends ContentKind = ContentKind> = `${K}:${string}`

export const SETTINGS_SECTIONS = [
  'physics',
  'body',
  'player',
  'enemy',
  'reactions',
  'actions',
  'spawning',
  'camera',
  'stage',
  'scoring',
  'rules',
  'input',
  'feel',
  'audio',
] as const satisfies readonly (keyof Settings)[]

// ------------------------------------------------------------------ parsing

const issuePath = (path: (string | number)[]): string =>
  path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '') || '(pack)'

const issueErrors = (issues: ZodIssue[], pack?: string): ContentError[] =>
  issues.map((i) => ({ ...(pack ? { pack } : {}), path: issuePath(i.path), message: i.message }))

/** Upgrade an older pack, then validate its shape (no cross-references; see `buildRegistry`). */
export const parsePack = (input: unknown): Result<Pack> => {
  const id =
    typeof input === 'object' && input !== null && typeof (input as { id?: unknown }).id === 'string'
      ? (input as { id: string }).id
      : undefined
  const migrated = migratePack(input)
  if (!migrated.ok) return { ok: false, errors: [{ ...(id ? { pack: id } : {}), path: 'schemaVersion', message: migrated.message }] }
  const result = packSchema.safeParse(migrated.value)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, errors: issueErrors(result.error.issues, id) }
}

/** One error per line, for logs and the loading screen. */
export const formatErrors = (errors: ContentError[]): string =>
  errors.map((e) => `${e.pack ? `[${e.pack}] ` : ''}${e.path}: ${e.message}`).join('\n')

// ----------------------------------------------------------------- registry

export interface ContentData {
  /** The packs in load order. */
  packs: readonly Pack[]
  settings: Settings
  moves: Readonly<Record<string, MoveDefData>>
  ai: Readonly<Record<string, AiBehaviorDef>>
  enemyTypes: Readonly<Record<string, EnemyTypeData>>
  pickups: Readonly<Record<string, PickupDefData>>
  themes: Readonly<Record<string, ThemeDefData>>
  props: Readonly<Record<string, PropDefData>>
  sounds: Readonly<Record<string, SoundDefData>>
  music: Readonly<Record<string, MusicDefData>>
  /** In play order. */
  levels: readonly LevelDef[]
  assets: Readonly<Record<string, AssetDef>>
  /** Which pack each definition (`kind:id`) and settings section (`settings:camera`) came from. */
  origins: ReadonlyMap<string, string>
}

/** Merged, cross-checked content from one or more packs. Build it with `buildRegistry`, which validates first. */
export class ContentRegistry {
  readonly packs: readonly Pack[]
  readonly settings: Settings
  readonly moves: Readonly<Record<string, MoveDefData>>
  readonly ai: Readonly<Record<string, AiBehaviorDef>>
  readonly enemyTypes: Readonly<Record<string, EnemyTypeData>>
  readonly pickups: Readonly<Record<string, PickupDefData>>
  readonly themes: Readonly<Record<string, ThemeDefData>>
  readonly props: Readonly<Record<string, PropDefData>>
  readonly sounds: Readonly<Record<string, SoundDefData>>
  readonly music: Readonly<Record<string, MusicDefData>>
  readonly levels: readonly LevelDef[]
  readonly assets: Readonly<Record<string, AssetDef>>
  private readonly origins: ReadonlyMap<string, string>

  constructor(data: ContentData) {
    this.packs = data.packs
    this.settings = data.settings
    this.moves = data.moves
    this.ai = data.ai
    this.enemyTypes = data.enemyTypes
    this.pickups = data.pickups
    this.themes = data.themes
    this.props = data.props
    this.sounds = data.sounds
    this.music = data.music
    this.levels = data.levels
    this.assets = data.assets
    this.origins = data.origins
  }

  private table(kind: ContentKind): Readonly<Record<string, KindMap[ContentKind]>> {
    switch (kind) {
      case 'move':
        return this.moves
      case 'ai':
        return this.ai
      case 'enemyType':
        return this.enemyTypes
      case 'pickup':
        return this.pickups
      case 'theme':
        return this.themes
      case 'prop':
        return this.props
      case 'sound':
        return this.sounds
      case 'music':
        return this.music
      case 'asset':
        return this.assets
      case 'level':
        return Object.fromEntries(this.levels.map((l) => [l.id, l]))
      default:
        return {}
    }
  }

  /** Every id of a kind. */
  ids(kind: ContentKind): string[] {
    return Object.keys(this.table(kind))
  }

  /** Look up `kind:id` (e.g. `move:jab`), or undefined if there is none. */
  get<K extends ContentKind>(ref: ContentRef<K>): KindMap[K] | undefined {
    const { kind, id } = splitRef(ref)
    const table = this.table(kind)
    return Object.prototype.hasOwnProperty.call(table, id) ? (table[id] as KindMap[K]) : undefined
  }

  /** Like `get`, but throws for a missing id (for code paths the registry already validated). */
  resolve<K extends ContentKind>(ref: ContentRef<K>): KindMap[K] {
    const def = this.get(ref)
    if (def === undefined) throw new Error(`unknown ${ref}`)
    return def
  }

  /** The pack a definition (`kind:id`) or settings section (`settings:camera`) came from. */
  originOf(ref: string): string | undefined {
    return this.origins.get(ref)
  }

  /**
   * The content as the runtime `GameConfig` (plus the levels). A gltf model
   * that names a pack asset gets its URL from `assetUrl` (the asset's path by
   * default; bundles map it to a blob URL in M2.3).
   */
  toGameConfig(assetUrl: (asset: AssetDef) => string = (a) => a.path): { config: GameConfig; levels: Level[] } {
    const model = (m: ModelRefDef): ModelRef => {
      if (m.kind === 'procedural') return m
      const { asset, url, ...rest } = m
      return { ...rest, url: url !== undefined ? siteUrl(url) : assetUrl(this.resolve(`asset:${asset ?? ''}`)) }
    }
    const audioUrl = (m: { url?: string; asset?: string }) =>
      m.url !== undefined ? siteUrl(m.url) : assetUrl(this.resolve(`asset:${m.asset ?? ''}`))
    const sound = (d: SoundDefData): SoundDef => (d.kind === 'file' ? { kind: 'file', url: audioUrl(d), volume: d.volume } : d)
    const music = (d: MusicDefData): MusicDef => (d.kind === 'file' ? { kind: 'file', url: audioUrl(d), volume: d.volume } : d)
    const s = this.settings
    const config: GameConfig = {
      ...s,
      player: { ...s.player, model: model(s.player.model) },
      enemyTypes: Object.fromEntries(
        Object.entries(this.enemyTypes).map(([id, t]) => [id, { ...t, model: model(t.model) }])
      ),
      ai: { ...this.ai },
      moves: { ...this.moves },
      pickups: { ...this.pickups },
      themes: { ...this.themes },
      props: { ...this.props },
      sounds: Object.fromEntries(Object.entries(this.sounds).map(([id, d]) => [id, sound(d)])),
      music: Object.fromEntries(Object.entries(this.music).map(([id, d]) => [id, music(d)])),
    }
    return { config, levels: [...this.levels] }
  }
}

export const splitRef = (ref: string): { kind: ContentKind; id: string } => {
  const i = ref.indexOf(':')
  return { kind: ref.slice(0, i) as ContentKind, id: ref.slice(i + 1) }
}

// ----------------------------------------------------------------- building

/**
 * Validate and merge packs in load order, then check references. The first
 * pack is usually the default pack; later ones add or override by id. Every
 * settings section must be supplied by some pack, and at least one level.
 */
export const buildRegistry = (inputs: unknown[]): Result<ContentRegistry> => {
  const errors: ContentError[] = []
  const packs: Pack[] = []
  for (const input of inputs) {
    const r = parsePack(input)
    if (r.ok) packs.push(r.value)
    else errors.push(...r.errors)
  }
  if (errors.length) return { ok: false, errors }
  if (packs.length === 0) return { ok: false, errors: [{ path: '(packs)', message: 'no packs to load' }] }

  const origins = new Map<string, string>()
  const settings: Partial<Settings> = {}
  const moves: Record<string, MoveDefData> = {}
  const ai: Record<string, AiBehaviorDef> = {}
  const enemyTypes: Record<string, EnemyTypeData> = {}
  const pickups: Record<string, PickupDefData> = {}
  const themes: Record<string, ThemeDefData> = {}
  const props: Record<string, PropDefData> = {}
  const sounds: Record<string, SoundDefData> = {}
  const music: Record<string, MusicDefData> = {}
  const assets: Record<string, AssetDef> = {}
  const levels: LevelDef[] = []

  const seenPackIds = new Set<string>()
  for (const pack of packs) {
    if (seenPackIds.has(pack.id)) errors.push({ pack: pack.id, path: 'id', message: `pack "${pack.id}" is loaded twice` })
    seenPackIds.add(pack.id)

    for (const section of SETTINGS_SECTIONS) {
      if (pack.settings[section] === undefined) continue
      ;(settings as Record<string, unknown>)[section] = pack.settings[section]
      origins.set(`settings:${section}`, pack.id)
    }
    const merge = <T>(kind: ContentKind, into: Record<string, T>, from: Record<string, T>) => {
      for (const [id, def] of Object.entries(from)) {
        into[id] = def
        origins.set(`${kind}:${id}`, pack.id)
      }
    }
    merge('move', moves, pack.moves)
    merge('ai', ai, pack.ai)
    merge('enemyType', enemyTypes, pack.enemyTypes)
    merge('pickup', pickups, pack.pickups)
    merge('theme', themes, pack.themes)
    merge('prop', props, pack.props)
    merge('sound', sounds, pack.sounds)
    merge('music', music, pack.music)

    const assetIds = new Set<string>()
    pack.assets.forEach((a, i) => {
      if (assetIds.has(a.id)) errors.push({ pack: pack.id, path: `assets[${i}].id`, message: `duplicate asset id "${a.id}"` })
      assetIds.add(a.id)
      assets[a.id] = a
      origins.set(`asset:${a.id}`, pack.id)
    })

    const levelIds = new Set<string>()
    pack.levels.forEach((level, i) => {
      if (levelIds.has(level.id)) errors.push({ pack: pack.id, path: `levels[${i}].id`, message: `duplicate level id "${level.id}"` })
      levelIds.add(level.id)
      const existing = levels.findIndex((l) => l.id === level.id)
      if (existing >= 0) levels[existing] = level
      else levels.push(level)
      origins.set(`level:${level.id}`, pack.id)
    })
  }

  for (const section of SETTINGS_SECTIONS) {
    if (settings[section] === undefined)
      errors.push({ path: `settings.${section}`, message: 'missing: no loaded pack defines it' })
  }
  if (levels.length === 0) errors.push({ path: 'levels', message: 'no loaded pack defines a level' })
  if (errors.length) return { ok: false, errors }

  const registry = new ContentRegistry({
    packs,
    settings: settings as Settings,
    moves,
    ai,
    enemyTypes,
    pickups,
    themes,
    props,
    sounds,
    music,
    levels,
    assets,
    origins,
  })
  const refErrors = checkReferences(registry)
  return refErrors.length ? { ok: false, errors: refErrors } : { ok: true, value: registry }
}

// ---------------------------------------------------------- cross-checking

/** Every broken reference or inconsistency across the merged content. */
export const checkReferences = (reg: ContentRegistry): ContentError[] => {
  const errors: ContentError[] = []
  const err = (origin: string, path: string, message: string) => {
    const pack = reg.originOf(origin)
    errors.push({ ...(pack ? { pack } : {}), path, message })
  }
  const expect = (kind: ContentKind, id: string | undefined, origin: string, path: string) => {
    if (id !== undefined && reg.get(`${kind}:${id}`) === undefined) err(origin, path, `unknown ${kind} "${id}"`)
  }
  const checkModel = (m: ModelRefDef, origin: string, path: string) => {
    if (m.kind !== 'gltf' || m.asset === undefined) return
    const asset = reg.get(`asset:${m.asset}`)
    if (!asset) err(origin, `${path}.asset`, `unknown asset "${m.asset}"`)
    else if (asset.kind !== 'model') err(origin, `${path}.asset`, `asset "${m.asset}" is a ${asset.kind}, not a model`)
  }

  const { player, enemy } = reg.settings
  // Each trigger's move exists, and a chord names different actions.
  player.moveset.forEach((t, i) => {
    expect('move', t.move, 'settings:player', `settings.player.moveset[${i}].move`)
    const actions = triggerActions(t)
    if (new Set(actions).size !== actions.length) err('settings:player', `settings.player.moveset[${i}].action`, 'a chord needs different actions')
  })
  const presses = new Set(pressKeys(player.moveset))
  checkModel(player.model, 'settings:player', 'settings.player.model')
  expect('move', enemy.attackMove, 'settings:enemy', 'settings.enemy.attackMove')
  // An input does one thing per device; the keyboard must be able to play the
  // game on its own, and a gamepad must at least move and pause.
  const bindings = reg.settings.input.bindings
  for (const device of DEVICES)
    for (const { key, actions } of bindingConflicts(bindings[device]))
      err('settings:input', `settings.input.bindings.${device}`, `"${key}" is bound to both ${actions.join(' and ')}`)
  for (const action of ['left', 'right', 'attack', 'pause'] as const)
    if (bindings.keyboard[action].length === 0) err('settings:input', `settings.input.bindings.keyboard.${action}`, 'needs at least one key')
  for (const action of ['left', 'right', 'pause'] as const)
    if (bindings.gamepad[action].length === 0) err('settings:input', `settings.input.bindings.gamepad.${action}`, 'needs at least one button')

  const checkAudioFile = (d: { kind: string; asset?: string }, origin: string, path: string) => {
    if (d.kind !== 'file' || d.asset === undefined) return
    const asset = reg.get(`asset:${d.asset}`)
    if (!asset) err(origin, `${path}.asset`, `unknown asset "${d.asset}"`)
    else if (asset.kind !== 'audio') err(origin, `${path}.asset`, `asset "${d.asset}" is a ${asset.kind}, not audio`)
  }
  for (const [id, d] of Object.entries(reg.sounds)) checkAudioFile(d, `sound:${id}`, `sounds.${id}`)
  for (const [id, d] of Object.entries(reg.music)) checkAudioFile(d, `music:${id}`, `music.${id}`)
  for (const [event, id] of Object.entries(reg.settings.audio)) expect('sound', id, 'settings:audio', `settings.audio.${event}`)

  for (const [id, m] of Object.entries(reg.moves)) {
    const origin = `move:${id}`
    expect('move', m.next, origin, `moves.${id}.next`)
    for (const [press, target] of Object.entries(m.branches ?? {})) {
      if (!presses.has(press)) err(origin, `moves.${id}.branches.${press}`, `"${press}" isn't an action or a chord the player's moveset uses`)
      expect('move', target, origin, `moves.${id}.branches.${press}`)
    }
    expect('sound', m.sound, origin, `moves.${id}.sound`)
    expect('sound', m.hitSound, origin, `moves.${id}.hitSound`)
    const cancel = cancelTime(m)
    if (cancel < m.startup || cancel > moveDuration(m))
      err(origin, `moves.${id}.cancelFrom`, `${cancel}s is outside the move (startup ${m.startup}s to end ${moveDuration(m)}s)`)
    if (m.air && m.lunge) err(origin, `moves.${id}`, 'a move can\'t be both "air" and "lunge"')
  }

  for (const [id, t] of Object.entries(reg.enemyTypes)) {
    const origin = `enemyType:${id}`
    expect('ai', t.ai, origin, `enemyTypes.${id}.ai`)
    expect('move', t.attackMove, origin, `enemyTypes.${id}.attackMove`)
    const checkAttacks = (attacks: { move: string }[] | undefined, path: string) =>
      attacks?.forEach((a, i) => expect('move', a.move, origin, `${path}[${i}].move`))
    checkAttacks(t.attacks, `enemyTypes.${id}.attacks`)
    t.boss?.phases.forEach((p, i) => {
      const pp = `enemyTypes.${id}.boss.phases[${i}]`
      const prev = t.boss!.phases[i - 1]
      if (prev && p.below >= prev.below) err(origin, `${pp}.below`, `must be below the previous phase's ${prev.below}`)
      expect('ai', p.ai, origin, `${pp}.ai`)
      checkAttacks(p.attacks, `${pp}.attacks`)
      expect('sound', p.taunt, origin, `${pp}.taunt`)
      p.summon?.enemies.forEach((e, ei) => expect('enemyType', e.type, origin, `${pp}.summon.enemies[${ei}].type`))
    })
    expect('pickup', t.drop?.pickup, origin, `enemyTypes.${id}.drop.pickup`)
    checkModel(t.model, origin, `enemyTypes.${id}.model`)
  }

  for (const pack of reg.packs) {
    if (pack.meta.cover === undefined) continue
    const a = pack.assets.find((x) => x.id === pack.meta.cover)
    if (!a) errors.push({ pack: pack.id, path: 'meta.cover', message: `unknown asset "${pack.meta.cover}" in this pack` })
    else if (a.kind !== 'texture')
      errors.push({ pack: pack.id, path: 'meta.cover', message: `asset "${a.id}" is a ${a.kind}, not a texture` })
  }

  for (const [id, p] of Object.entries(reg.props))
    expect('pickup', p.breakable?.drop?.pickup, `prop:${id}`, `props.${id}.breakable.drop.pickup`)

  reg.levels.forEach((level) => {
    const origin = `level:${level.id}`
    const base = `levels.${level.id}`
    expect('theme', level.theme, origin, `${base}.theme`)
    expect('music', level.music, origin, `${base}.music`)
    let goals = 0
    level.segments.forEach((seg, si) => {
      const sp = `${base}.segments[${si}]`
      seg.triggers.forEach((t, ti) => {
        const tp = `${sp}.triggers[${ti}]`
        if (t.at > seg.length) err(origin, `${tp}.at`, `${t.at} is past the segment's length ${seg.length}`)
        if (t.kind === 'goal') goals++
        else
          t.waves.forEach((w, wi) =>
            w.enemies.forEach((e, ei) => expect('enemyType', e.type, origin, `${tp}.waves[${wi}].enemies[${ei}].type`))
          )
      })
      seg.items?.forEach((it, ii) => {
        const ip = `${sp}.items[${ii}]`
        if (it.at > seg.length) err(origin, `${ip}.at`, `${it.at} is past the segment's length ${seg.length}`)
        expect('pickup', it.pickup, origin, `${ip}.pickup`)
      })
      seg.props?.forEach((pl, pi) => {
        const pp = `${sp}.props[${pi}]`
        if (pl.at > seg.length) err(origin, `${pp}.at`, `${pl.at} is past the segment's length ${seg.length}`)
        expect('prop', pl.prop, origin, `${pp}.prop`)
      })
    })
    if (goals === 0) err(origin, `${base}`, 'has no goal trigger, so it can never be completed')
  })

  return errors
}
