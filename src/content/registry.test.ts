import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { LEVELS } from '../config/levels'
import { defaultPack } from './defaultPack'
import { buildRegistry, formatErrors, parsePack, type ContentError, type ContentRegistry } from './registry'
import { SCHEMA_VERSION } from './schemas'

// Deep copy so tests can break a pack without touching the shared config.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const base = (): Record<string, unknown> => clone(defaultPack()) as unknown as Record<string, unknown>

/** A minimal add-on pack: only metadata, plus whatever the test adds. */
const addon = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'remix',
  name: 'Remix',
  version: '0.1.0',
  meta: { author: 'Tester', description: '', license: 'CC0-1.0' },
  ...extra,
})

const build = (...packs: unknown[]): ContentRegistry => {
  const r = buildRegistry(packs)
  if (!r.ok) throw new Error(formatErrors(r.errors))
  return r.value
}

const errorsOf = (...packs: unknown[]): ContentError[] => {
  const r = buildRegistry(packs)
  if (r.ok) throw new Error('expected the packs to be rejected')
  return r.errors
}

const paths = (errors: ContentError[]) => errors.map((e) => e.path)

describe('default pack', () => {
  it('validates', () => {
    expect(parsePack(defaultPack()).ok).toBe(true)
  })

  it('survives a JSON round trip', () => {
    expect(buildRegistry([JSON.parse(JSON.stringify(defaultPack()))]).ok).toBe(true)
  })

  it('turns back into exactly the runtime config and levels', () => {
    const { config, levels } = build(defaultPack()).toGameConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(levels).toEqual(LEVELS)
  })
})

describe('registry lookups', () => {
  const reg = build(defaultPack())

  it('resolves kind:id references', () => {
    expect(reg.get('move:jab')).toEqual(DEFAULT_CONFIG.moves.jab)
    expect(reg.get('enemyType:HEAVY')?.ai).toBe('tank')
    expect(reg.get('ai:flanker')?.approach).toBe('behind')
    expect(reg.get('pickup:coin')?.effect).toBe('score')
    expect(reg.get('level:level-2')?.name).toBe(LEVELS[1].name)
  })

  it('returns undefined for unknown ids, and resolve throws', () => {
    expect(reg.get('move:nope')).toBeUndefined()
    expect(reg.get('move:toString')).toBeUndefined()
    expect(() => reg.resolve('move:nope')).toThrow('unknown move:nope')
  })

  it('lists ids per kind, levels in play order', () => {
    expect(reg.ids('move')).toContain('uppercut')
    expect(reg.ids('level')).toEqual(LEVELS.map((l) => l.id))
  })

  it('records which pack each definition came from', () => {
    expect(reg.originOf('move:jab')).toBe('default')
    expect(reg.originOf('settings:camera')).toBe('default')
  })
})

describe('layering packs', () => {
  it('lets a later pack override and add by id', () => {
    const jab = { ...clone(DEFAULT_CONFIG.moves.jab), damage: 99 }
    const level = { id: 'extra', name: 'Extra', theme: 'default', segments: [{ length: 20, triggers: [{ kind: 'goal', at: 18 }] }] }
    const reg = build(
      defaultPack(),
      addon({
        moves: { jab },
        enemyTypes: { BRUTE: { ...clone(DEFAULT_CONFIG.enemyTypes.HEAVY), maxHealth: 300 } },
        levels: [level],
        settings: { rules: { ...DEFAULT_CONFIG.rules, lives: 9 } },
      })
    )
    expect(reg.get('move:jab')?.damage).toBe(99)
    expect(reg.originOf('move:jab')).toBe('remix')
    expect(reg.get('move:hook')).toEqual(DEFAULT_CONFIG.moves.hook)
    expect(reg.get('enemyType:BRUTE')?.maxHealth).toBe(300)
    expect(reg.settings.rules.lives).toBe(9)
    expect(reg.settings.camera).toEqual(DEFAULT_CONFIG.camera)
    expect(reg.ids('level')).toEqual([...LEVELS.map((l) => l.id), 'extra'])
  })

  it('replaces a level with the same id in place', () => {
    const renamed = { ...clone(LEVELS[0]), name: 'Renamed' }
    const reg = build(defaultPack(), addon({ levels: [renamed] }))
    expect(reg.levels[0].name).toBe('Renamed')
    expect(reg.levels).toHaveLength(LEVELS.length)
  })

  it('lets an add-on reference definitions from the base pack', () => {
    const level = {
      id: 'arena',
      name: 'Arena',
      theme: 'default',
      segments: [
        {
          length: 30,
          triggers: [
            { kind: 'wave', at: 5, lock: true, waves: [{ enemies: [{ type: 'HEAVY', from: 'right' }] }] },
            { kind: 'goal', at: 28 },
          ],
          items: [{ at: 10, pickup: 'feast' }],
        },
      ],
    }
    expect(buildRegistry([defaultPack(), addon({ levels: [level] })]).ok).toBe(true)
  })

  it('attributes a broken reference to the pack that made it', () => {
    const errors = errorsOf(defaultPack(), addon({ moves: { jab: { ...clone(DEFAULT_CONFIG.moves.jab), next: 'kick' } } }))
    expect(errors).toEqual([{ pack: 'remix', path: 'moves.jab.next', message: 'unknown move "kick"' }])
  })

  it('rejects loading the same pack twice', () => {
    expect(paths(errorsOf(defaultPack(), defaultPack()))).toEqual(['id'])
  })

  it('needs every settings section and a level from some pack', () => {
    const errors = errorsOf(addon())
    expect(paths(errors)).toContain('settings.camera')
    expect(paths(errors)).toContain('levels')
  })

  it('rejects an empty pack list', () => {
    expect(paths(errorsOf())).toEqual(['(packs)'])
  })
})

describe('bad packs: shape', () => {
  it('rejects things that are not packs', () => {
    expect(parsePack(null).ok).toBe(false)
    expect(parsePack('pack').ok).toBe(false)
    expect(parsePack([]).ok).toBe(false)
  })

  it('names the field and the problem', () => {
    const p = base()
    ;(p.moves as Record<string, { startup: unknown }>).jab.startup = -1
    const r = parsePack(p)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toHaveLength(1)
      expect(r.errors[0].pack).toBe('default')
      expect(r.errors[0].path).toBe('moves.jab.startup')
      expect(r.errors[0].message).toMatch(/greater than or equal to 0/)
    }
  })

  it('reports every problem, not just the first', () => {
    const p = base()
    const moves = p.moves as Record<string, Record<string, unknown>>
    moves.jab.damage = 'lots'
    moves.hook.active = 0
    ;(p.settings as Record<string, Record<string, unknown>>).rules.lives = 0
    expect(paths(errorsOf(p)).sort()).toEqual(['moves.hook.active', 'moves.jab.damage', 'settings.rules.lives'])
  })

  it('catches misspelled fields', () => {
    const p = base()
    ;(p.moves as Record<string, Record<string, unknown>>).jab.dammage = 8
    const errors = errorsOf(p)
    expect(paths(errors)).toEqual(['moves.jab'])
    expect(errors[0].message).toMatch(/dammage/)
  })

  it.each([
    ['schemaVersion', 99],
    ['version', '1.0'],
    ['id', '9lives'],
    ['id', 'has space'],
    ['name', ''],
  ])('rejects a bad %s (%j)', (field, value) => {
    expect(paths(errorsOf({ ...base(), [field]: value }))).toEqual([field])
  })

  it('rejects a bad id used as a record key', () => {
    const p = base()
    ;(p.moves as Record<string, unknown>)['bad id'] = clone(DEFAULT_CONFIG.moves.jab)
    expect(errorsOf(p).length).toBeGreaterThan(0)
  })

  it('rejects bad colours, fractions and vectors', () => {
    const p = base()
    const s = p.settings as Record<string, Record<string, unknown>>
    s.player.color = 'blue'
    s.player.spawnPosition = [0, 1]
    ;(p.enemyTypes as Record<string, Record<string, unknown>>).BASIC.drop = { pickup: 'coin', chance: 1.5 }
    expect(paths(errorsOf(p)).sort()).toEqual([
      'enemyTypes.BASIC.drop.chance',
      'settings.player.color',
      'settings.player.spawnPosition',
    ])
  })

  it('checks ranges that span two fields', () => {
    const p = base()
    const s = p.settings as Record<string, Record<string, unknown>>
    s.stage.depthBand = [3, -3]
    ;(s.enemy.patrol as Record<string, number>).minDistance = 20
    expect(paths(errorsOf(p)).sort()).toEqual(['settings.enemy.patrol', 'settings.stage.depthBand'])
  })

  it('needs exactly one of url or asset on a gltf model', () => {
    const p = base()
    const model = (p.settings as Record<string, Record<string, Record<string, unknown>>>).player.model
    delete model.url
    expect(paths(errorsOf(p))).toEqual(['settings.player.model'])
    model.url = '/a.glb'
    model.asset = 'robot'
    expect(paths(errorsOf(p))).toEqual(['settings.player.model'])
  })

  it('rejects an unknown model kind and an unknown fighter state in clips', () => {
    const p = base()
    const types = p.enemyTypes as Record<string, Record<string, Record<string, unknown>>>
    types.BASIC.model = { kind: 'sprite' }
    ;(types.FAST.model.clips as Record<string, string>).taunt = 'Wave'
    expect(paths(errorsOf(p)).sort()).toEqual(['enemyTypes.BASIC.model.kind', 'enemyTypes.FAST.model.clips.taunt'])
  })

  it('checks level structure', () => {
    const p = base()
    const level = (p.levels as Record<string, unknown>[])[0] as { segments: Record<string, unknown>[] }
    const triggers = level.segments[0].triggers as Record<string, unknown>[]
    triggers.push({ kind: 'cutscene', at: 1 })
    triggers.push({ kind: 'wave', at: 1, waves: [] })
    triggers.push({ kind: 'wave', at: 1, waves: [{ enemies: [{ type: 'BASIC', from: 'placed' }] }] })
    expect(paths(errorsOf(p)).sort()).toEqual([
      'levels[0].segments[0].triggers[2].kind',
      'levels[0].segments[0].triggers[3].waves',
      'levels[0].segments[0].triggers[4].waves[0].enemies[0].x',
    ])
  })

  it('rejects a level with no segments', () => {
    const p = base()
    ;(p.levels as Record<string, unknown>[])[0].segments = []
    expect(paths(errorsOf(p))).toEqual(['levels[0].segments'])
  })

  it('checks asset entries', () => {
    const p = { ...base(), assets: [{ id: 'robot', kind: 'mesh', path: '' , hash: 'abc' }] }
    expect(paths(errorsOf(p)).sort()).toEqual(['assets[0].hash', 'assets[0].kind', 'assets[0].path'])
  })
})

describe('bad packs: references', () => {
  const moves = (p: Record<string, unknown>) => p.moves as Record<string, Record<string, unknown>>
  const settings = (p: Record<string, unknown>) => p.settings as Record<string, Record<string, unknown>>
  const types = (p: Record<string, unknown>) => p.enemyTypes as Record<string, Record<string, unknown>>

  it('checks the player and enemy moves', () => {
    const p = base()
    settings(p).player.moveset = [
      { action: 'attack', when: 'running', move: 'slide' },
      { action: 'attack', move: 'jabb' },
    ]
    settings(p).enemy.attackMove = 'bite'
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'settings.enemy.attackMove: unknown move "bite"',
      'settings.player.moveset[0].move: unknown move "slide"',
      'settings.player.moveset[1].move: unknown move "jabb"',
    ])
  })

  it('checks branch presses and chords', () => {
    const p = base()
    const moves = p.moves as Record<string, Record<string, unknown>>
    moves.jab.branches = { 'attack+jump': 'jab2', heavy: 'hook', dodge: 'nope' }
    settings(p).player.moveset = [{ action: ['attack', 'attack'], move: 'jab' }, ...DEFAULT_CONFIG.player.moveset]
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'moves.jab.branches.attack+jump: "attack+jump" isn\'t an action or a chord the player\'s moveset uses',
      'moves.jab.branches.dodge: unknown move "nope"',
      'settings.player.moveset[0].action: a chord needs different actions',
    ])
  })

  it('checks combo links and cancel windows', () => {
    const p = base()
    moves(p).hook.next = 'roundhouse'
    moves(p).jab.cancelFrom = 5
    moves(p).jab2.cancelFrom = 0.01
    expect(paths(errorsOf(p)).sort()).toEqual(['moves.hook.next', 'moves.jab.cancelFrom', 'moves.jab2.cancelFrom'])
  })

  it('rejects a move that is both air and lunge', () => {
    const p = base()
    moves(p).jumpKick.lunge = 3
    expect(paths(errorsOf(p))).toEqual(['moves.jumpKick'])
  })

  it('checks enemy archetypes, moves and drops', () => {
    const p = base()
    types(p).BASIC.ai = 'ninja'
    types(p).FAST.attackMove = 'teleport'
    types(p).HEAVY.drop = { pickup: 'gem', chance: 0.5 }
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'enemyTypes.BASIC.ai: unknown ai "ninja"',
      'enemyTypes.FAST.attackMove: unknown move "teleport"',
      'enemyTypes.HEAVY.drop.pickup: unknown pickup "gem"',
    ])
  })

  it('catches a definition removed while still in use', () => {
    const p = base()
    delete (p.ai as Record<string, unknown>).tank
    delete (p.pickups as Record<string, unknown>).food
    const errors = paths(errorsOf(p))
    expect(errors).toContain('enemyTypes.HEAVY.ai')
    expect(errors).toContain('enemyTypes.HEAVY.drop.pickup')
    expect(errors.some((e) => e.startsWith('levels.') && e.endsWith('.pickup'))).toBe(true)
  })

  it('checks level spawns, items, trigger positions and goals', () => {
    const p = base()
    const level = {
      id: 'broken',
      name: 'Broken',
      theme: 'default',
      segments: [
        {
          length: 10,
          triggers: [{ kind: 'wave', at: 12, waves: [{ enemies: [{ type: 'DRAGON', from: 'right' }] }] }],
          items: [{ at: 11, pickup: 'cake' }],
        },
      ],
    }
    ;(p.levels as unknown[]).push(level)
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'levels.broken.segments[0].items[0].at: 11 is past the segment\'s length 10',
      'levels.broken.segments[0].items[0].pickup: unknown pickup "cake"',
      'levels.broken.segments[0].triggers[0].at: 12 is past the segment\'s length 10',
      'levels.broken.segments[0].triggers[0].waves[0].enemies[0].type: unknown enemyType "DRAGON"',
      'levels.broken: has no goal trigger, so it can never be completed',
    ])
  })

  it('rejects duplicate level and asset ids inside one pack', () => {
    const p = base()
    ;(p.levels as unknown[]).push(clone(LEVELS[0]))
    p.assets = [
      { id: 'a', kind: 'model', path: 'a.glb' },
      { id: 'a', kind: 'model', path: 'b.glb' },
    ]
    expect(paths(errorsOf(p)).sort()).toEqual(['assets[1].id', `levels[${LEVELS.length}].id`])
  })

  it('resolves model assets and checks their kind', () => {
    const asset = (kind: string) => [{ id: 'robot', kind, path: 'models/robot.glb' }]
    const withAssetModel = (kind: string) => {
      const p = base()
      const model = settings(p).player.model as Record<string, unknown>
      delete model.url
      model.asset = 'robot'
      p.assets = asset(kind)
      return p
    }
    const reg = build(withAssetModel('model'))
    const player = reg.toGameConfig((a) => `blob:${a.path}`).config.player.model
    expect(player.kind === 'gltf' && player.url).toBe('blob:models/robot.glb')

    expect(errorsOf(withAssetModel('audio'))[0].message).toBe('asset "robot" is a audio, not a model')
    const missing = withAssetModel('model')
    missing.assets = []
    expect(paths(errorsOf(missing))).toEqual(['settings.player.model.asset'])
  })

  it('checks the cover image', () => {
    const p = base()
    ;(p.meta as Record<string, unknown>).cover = 'cover'
    expect(paths(errorsOf(p))).toEqual(['meta.cover'])
    p.assets = [{ id: 'cover', kind: 'texture', path: 'cover.png' }]
    expect(buildRegistry([p]).ok).toBe(true)
  })
})

describe('formatErrors', () => {
  it('prints one line per error with the pack and path', () => {
    expect(
      formatErrors([
        { pack: 'remix', path: 'moves.jab.next', message: 'unknown move "kick"' },
        { path: 'levels', message: 'no loaded pack defines a level' },
      ])
    ).toBe('[remix] moves.jab.next: unknown move "kick"\nlevels: no loaded pack defines a level')
  })
})

describe('schema version 1 packs', () => {
  const v1 = (settings: Record<string, unknown>) => ({ ...addon({ settings }), schemaVersion: 1 })
  const rulesV1: Record<string, unknown> = { ...DEFAULT_CONFIG.rules }
  for (const key of ['maxSimultaneousAttackers', 'friendlyFire', 'difficulty']) delete rulesV1[key]
  const enemyV1 = { ...DEFAULT_CONFIG.enemy, maxSimultaneousAttackers: 3 }

  it('move the attacker limit from enemy to rules and get the new rules defaults', () => {
    const reg = build(defaultPack(), v1({ enemy: enemyV1, rules: { ...rulesV1, lives: 5 } }))
    expect(reg.settings.rules).toEqual({
      ...rulesV1,
      lives: 5,
      maxSimultaneousAttackers: 3,
      friendlyFire: false,
      difficulty: { damageTaken: 1, enemyHealth: 1 },
    })
    expect(reg.settings.enemy).toEqual(DEFAULT_CONFIG.enemy)
  })

  it('still load when they only override enemy (the limit then comes from the base rules)', () => {
    const reg = build(defaultPack(), v1({ enemy: enemyV1 }))
    expect(reg.settings.rules).toEqual(DEFAULT_CONFIG.rules)
  })

  it('inherit the base key bindings', () => {
    expect(build(defaultPack(), v1({ rules: rulesV1 })).settings.input).toEqual(DEFAULT_CONFIG.input)
  })
})

describe('key bindings', () => {
  const withBindings = (b: Record<string, string[]>, device: 'keyboard' | 'mouse' | 'gamepad' = 'keyboard') => {
    const all = DEFAULT_CONFIG.input.bindings
    return addon({ settings: { input: { ...DEFAULT_CONFIG.input, bindings: { ...all, [device]: { ...all[device], ...b } } } } })
  }

  it('lets a pack rebind keys', () => {
    expect(build(defaultPack(), withBindings({ attack: ['z'] })).settings.input.bindings.keyboard.attack).toEqual(['z'])
  })

  it('rejects an input bound to two actions on one device', () => {
    expect(errorsOf(defaultPack(), withBindings({ block: ['j'] }))).toEqual([
      { pack: 'remix', path: 'settings.input.bindings.keyboard', message: '"j" is bound to both attack and block' },
    ])
    expect(errorsOf(defaultPack(), withBindings({ jump: ['x'] }, 'gamepad'))).toEqual([
      { pack: 'remix', path: 'settings.input.bindings.gamepad', message: '"x" is bound to both jump and attack' },
    ])
  })

  it('lets the same name mean different inputs on different devices', () => {
    // "left" is a mouse button, a d-pad direction and an action.
    const reg = build(defaultPack(), withBindings({ attack: [], jump: ['left'] }, 'mouse'))
    expect(reg.settings.input.bindings.mouse.jump).toEqual(['left'])
    expect(reg.settings.input.bindings.gamepad.left).toContain('left')
  })

  it('needs keys for moving, attacking and pausing, and pad buttons for moving and pausing', () => {
    expect(paths(errorsOf(defaultPack(), withBindings({ attack: [] })))).toEqual(['settings.input.bindings.keyboard.attack'])
    expect(paths(errorsOf(defaultPack(), withBindings({ pause: [] }, 'gamepad')))).toEqual(['settings.input.bindings.gamepad.pause'])
    // The mouse is optional.
    expect(build(defaultPack(), withBindings({ attack: [], block: [] }, 'mouse')).settings.input.bindings.mouse.attack).toEqual([])
  })

  it('needs lowercase keys, real buttons and every action listed', () => {
    const bad = withBindings({ attack: ['J'] })
    delete ((bad.settings as Record<string, Record<string, Record<string, Record<string, unknown>>>>).input.bindings.keyboard).hitboxes
    expect(paths(errorsOf(defaultPack(), bad)).sort()).toEqual(['settings.input.bindings.keyboard.attack[0]', 'settings.input.bindings.keyboard.hitboxes'])
    expect(paths(errorsOf(defaultPack(), withBindings({ attack: ['thumb'] }, 'mouse')))).toEqual(['settings.input.bindings.mouse.attack[0]'])
    expect(paths(errorsOf(defaultPack(), withBindings({ attack: ['b7', 'axis2-', 'paddle'] }, 'gamepad')))).toEqual([
      'settings.input.bindings.gamepad.attack[2]',
    ])
  })

  it('moves a v3 pack\'s key map into the keyboard, adding mouse and gamepad defaults', () => {
    const keyboard = { ...DEFAULT_CONFIG.input.bindings.keyboard, attack: ['z'] }
    const old = { ...addon({ settings: { input: { bindings: keyboard } } }), schemaVersion: 3 }
    const reg = build(defaultPack(), old)
    expect(reg.settings.input.bindings).toEqual({ ...DEFAULT_CONFIG.input.bindings, keyboard })
    expect(reg.settings.input.analog).toEqual(DEFAULT_CONFIG.input.analog)
  })

  it('turns a v5 pack\'s three attack slots into a moveset that plays the same', () => {
    const { moveset: _m, ...rest } = DEFAULT_CONFIG.player
    void _m
    const old = { ...addon({ settings: { player: { ...rest, lightAttack: 'hook', jumpAttack: 'jumpKick', dashAttack: 'dashPunch' } } }), schemaVersion: 5 }
    expect(build(defaultPack(), old).settings.player.moveset).toEqual([
      { action: 'attack', when: 'air', move: 'jumpKick' },
      { action: 'attack', when: 'running', move: 'dashPunch' },
      { action: 'attack', move: 'hook' },
    ])
  })

  it('gives a v6 pack heavy, special and run inputs it doesn\'t already use, the action settings and the meter', () => {
    const { heavy: _h, special: _s, run: _r, ...keyboard } = { ...DEFAULT_CONFIG.input.bindings.keyboard, dodge: ['l'] }
    void [_h, _s, _r]
    const strip = (b: Record<string, string[]>) => Object.fromEntries(Object.entries(b).filter(([a]) => !['heavy', 'special', 'run'].includes(a)))
    const { actions: _a, ...input } = DEFAULT_CONFIG.input
    void _a
    const { meter: _m, ...rules } = DEFAULT_CONFIG.rules
    void _m
    const bindings = { keyboard, mouse: strip(DEFAULT_CONFIG.input.bindings.mouse), gamepad: strip(DEFAULT_CONFIG.input.bindings.gamepad) }
    const old = { ...addon({ settings: { input: { ...input, bindings }, rules } }), schemaVersion: 6 }
    const reg = build(defaultPack(), old)
    // L was taken by dodge, so heavy gets nothing on the keyboard.
    expect(reg.settings.input.bindings.keyboard).toMatchObject({ dodge: ['l'], heavy: [], special: ['i'], run: ['q'] })
    expect(reg.settings.input.bindings.gamepad).toMatchObject({ heavy: ['y'], special: ['b'], run: ['ls'] })
    expect(reg.settings.input.actions).toEqual(DEFAULT_CONFIG.input.actions)
    expect(reg.settings.rules.meter).toEqual(DEFAULT_CONFIG.rules.meter)
  })

  it('gives a v7 pack grab inputs it doesn\'t already use, contact grabs and grab tuning', () => {
    const strip = (b: Record<string, string[]>) => Object.fromEntries(Object.entries(b).filter(([a]) => a !== 'grab'))
    const { grab: _g, ...actions } = DEFAULT_CONFIG.input.actions
    const { grab: _t, ...tuning } = DEFAULT_CONFIG.actions
    void [_g, _t]
    const b = DEFAULT_CONFIG.input.bindings
    const bindings = { keyboard: { ...strip(b.keyboard), heavy: ['o'] }, mouse: strip(b.mouse), gamepad: strip(b.gamepad) }
    const old = { ...addon({ settings: { input: { ...DEFAULT_CONFIG.input, actions, bindings }, actions: tuning } }), schemaVersion: 7 }
    const reg = build(defaultPack(), old)
    // O was taken by heavy, so grab gets nothing on the keyboard.
    expect(reg.settings.input.bindings.keyboard).toMatchObject({ heavy: ['o'], grab: [] })
    expect(reg.settings.input.bindings.gamepad.grab).toEqual(['rs'])
    expect(reg.settings.input.actions.grab).toEqual({ enabled: true, trigger: 'contact' })
    expect(reg.settings.actions.grab).toEqual(DEFAULT_CONFIG.actions.grab)
  })

  it('gives a v4 pack the analog and rumble defaults', () => {
    const { rumble: _r, ...feel } = DEFAULT_CONFIG.feel
    void _r
    const old = { ...addon({ settings: { input: { bindings: DEFAULT_CONFIG.input.bindings }, feel } }), schemaVersion: 4 }
    const reg = build(defaultPack(), old)
    expect(reg.settings.input.analog).toEqual(DEFAULT_CONFIG.input.analog)
    expect(reg.settings.feel.rumble).toEqual(DEFAULT_CONFIG.feel.rumble)
  })
})

describe('themes and props', () => {
  it('ships two distinct themes, used by the two default levels', () => {
    const reg = build(defaultPack())
    expect(reg.ids('theme').sort()).toEqual(['default', 'docks'])
    expect(reg.levels.map((l) => l.theme)).toEqual(['default', 'docks'])
    expect(reg.themes.default.sky).not.toBe(reg.themes.docks.sky)
    expect(reg.ids('prop')).toEqual(expect.arrayContaining(['crate', 'barrel', 'wall', 'platform']))
  })

  it('checks theme, prop and drop references', () => {
    const p = base()
    const level = (p.levels as Record<string, unknown>[])[0] as Record<string, unknown> & { segments: Record<string, unknown>[] }
    level.theme = 'moon'
    level.segments[0].props = [{ prop: 'piano', at: 3 }, { prop: 'crate', at: 999 }]
    ;(p.props as Record<string, Record<string, unknown>>).crate.breakable = { health: 5, drop: { pickup: 'gem', chance: 1 } }
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'levels.level-1.segments[0].props[0].prop: unknown prop "piano"',
      "levels.level-1.segments[0].props[1].at: 999 is past the segment's length 45",
      'levels.level-1.theme: unknown theme "moon"',
      'props.crate.breakable.drop.pickup: unknown pickup "gem"',
    ])
  })

  it('checks theme values', () => {
    const p = base()
    const t = (p.themes as Record<string, Record<string, unknown>>).docks
    t.fog = { color: '#ffffff', near: 50, far: 10 }
    ;(t.backdrop as Record<string, unknown>[])[0].parallax = 2
    expect(paths(errorsOf(p)).sort()).toEqual(['themes.docks.backdrop[0].parallax', 'themes.docks.fog'])
  })

  it('gives levels from older packs the default theme', () => {
    const old = { ...addon({ levels: [{ id: 'old', name: 'Old', segments: [{ length: 10, triggers: [{ kind: 'goal', at: 9 }] }] }] }), schemaVersion: 2 }
    expect(build(defaultPack(), old).get('level:old')?.theme).toBe('default')
  })
})

describe('audio content', () => {
  it('checks the sounds and music that moves, levels and settings name', () => {
    const errors = errorsOf(
      base(),
      addon({
        assets: [{ id: 'pic', kind: 'texture', path: 'p.png' }],
        settings: { audio: { hit: 'nope' } },
        moves: { jab: { ...(base().moves as Record<string, object>).jab, sound: 'missing' } },
        sounds: { pic: { kind: 'file', asset: 'pic', volume: 1 }, both: { kind: 'file', asset: 'pic', url: '/x.ogg', volume: 1 } },
        music: { tune: { kind: 'pattern', tempo: 100, volume: 0.5, tracks: [{ wave: 'sine', volume: 1, notes: 'A4 H9' }] } },
        levels: [{ ...(base().levels as object[])[0], id: 'extra', music: 'silence' }],
      })
    )
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'sounds.both: needs exactly one of "url" or "asset"',
      'music.tune.tracks[0].notes: use notes like C4, F#3 or Bb2, "." for a rest and "-" to hold, separated by spaces',
    ])
    const refs = errorsOf(
      base(),
      addon({
        assets: [{ id: 'pic', kind: 'texture', path: 'p.png' }],
        settings: { audio: { hit: 'nope' } },
        moves: { jab: { ...(base().moves as Record<string, object>).jab, sound: 'missing' } },
        sounds: { pic: { kind: 'file', asset: 'pic', volume: 1 } },
        levels: [{ ...(base().levels as object[])[0], id: 'extra', music: 'silence' }],
      })
    )
    expect(paths(refs).sort()).toEqual(['levels.extra.music', 'moves.jab.sound', 'settings.audio.hit', 'sounds.pic.asset'])
  })

  it('gives file sounds a URL and keeps synth sounds as they are', () => {
    const reg = build(base(), addon({ sounds: { tune: { kind: 'file', url: '/audio/t.ogg', volume: 0.5 } } }))
    const { config, levels } = reg.toGameConfig()
    expect(config.sounds.tune).toEqual({ kind: 'file', url: '/audio/t.ogg', volume: 0.5 })
    expect(config.sounds.punch.kind).toBe('synth')
    expect(levels[0].music).toBe('alley')
    expect(config.audio.hit).toBe('punch')
  })
})
