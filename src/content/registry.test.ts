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
    const level = { id: 'extra', name: 'Extra', segments: [{ length: 20, triggers: [{ kind: 'goal', at: 18 }] }] }
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
    settings(p).player.lightAttack = 'jabb'
    settings(p).player.dashAttack = 'slide'
    settings(p).enemy.attackMove = 'bite'
    expect(errorsOf(p).map((e) => `${e.path}: ${e.message}`).sort()).toEqual([
      'settings.enemy.attackMove: unknown move "bite"',
      'settings.player.dashAttack: unknown move "slide"',
      'settings.player.lightAttack: unknown move "jabb"',
    ])
  })

  it('checks combo links and cancel windows', () => {
    const p = base()
    moves(p).hook.next = 'haymaker'
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
