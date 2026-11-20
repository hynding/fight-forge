import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { bundleFromFolder } from '../content/bundleFolder'
import { readBundle } from '../content/bundle'
import { moveSchema, packSchema, settingsSchema } from '../content/schemas'
import { deleteIn, getIn, pathString, setIn } from './paths'
import { defaultFor, fieldKind, labelFor } from './schemaForm'
import { memoryStore } from './storage'
import { sandboxLevel } from './sandbox'
import { validateLevel } from '../sim/level'
import { addNode, buildTree, nodeValue, overrideNode, removeNode } from './tree'
import { addModelAsset, assetFile, comboChain, fitModel, gltfModelFor, moveFrames, phaseAt, removeAsset, setComboChain } from './fighter'
import { baseContent, duplicatePack, editPack, exportBundle, importBundle, newPack, slugify, uniqueId, validatePack } from './workspace'

const SAMPLE = join(__dirname, '../../content/samples/skeleton-remix')
const sample = () => bundleFromFolder(SAMPLE, (p) => new Uint8Array(readFileSync(p)), (f) => readdirSync(f))

describe('paths', () => {
  const v = { a: { b: [1, { c: 2 }] } }

  it('gets, sets and deletes without changing the original', () => {
    expect(getIn(v, ['a', 'b', 1, 'c'])).toBe(2)
    expect(getIn(v, ['x', 'y'])).toBeUndefined()
    const set = setIn(v, ['a', 'b', 1, 'c'], 3)
    expect(getIn(set, ['a', 'b', 1, 'c'])).toBe(3)
    expect(getIn(v, ['a', 'b', 1, 'c'])).toBe(2)
    expect(setIn({}, ['n', 0, 'k'], true)).toEqual({ n: [{ k: true }] })
    expect(deleteIn(v, ['a', 'b', 0])).toEqual({ a: { b: [{ c: 2 }] } })
    expect(deleteIn(v, ['a', 'b', 1, 'c'])).toEqual({ a: { b: [1, {}] } })
    expect(v).toEqual({ a: { b: [1, { c: 2 }] } })
  })

  it('spells paths the way the registry reports them', () => {
    expect(pathString(['levels', 0, 'segments', 1, 'at'])).toBe('levels[0].segments[1].at')
    expect(pathString(['moves', 'jab', 'damage'])).toBe('moves.jab.damage')
  })
})

describe('schema forms', () => {
  it('reads field kinds through optional, default and refinement wrappers', () => {
    expect(fieldKind(z.number().int().min(1).max(9).optional())).toEqual({ kind: 'number', int: true, min: 1, max: 9 })
    expect(fieldKind(settingsSchema.shape.player.shape.color).kind).toBe('color')
    expect(fieldKind(settingsSchema.shape.player.shape.model).kind).toBe('tagged')
    expect(fieldKind(packSchema.shape.moves).kind).toBe('record')
    const clips = fieldKind(settingsSchema.shape.player.shape.model)
    if (clips.kind !== 'tagged') throw new Error()
    const gltf = fieldKind(clips.options.get('gltf')!)
    if (gltf.kind !== 'object') throw new Error()
    const map = fieldKind(gltf.shape.clips)
    expect(map.kind === 'record' && map.keys).toContain('idle')
  })

  it('makes a starting value that passes the schema', () => {
    expect(moveSchema.safeParse(defaultFor(moveSchema)).success).toBe(true)
    expect(defaultFor(z.enum(['a', 'b']))).toBe('a')
  })

  it('labels camelCase keys', () => {
    expect(labelFor('colliderHalfExtents')).toBe('Collider half extents')
    expect(labelFor('maxHealth')).toBe('Max health')
  })
})

describe('workspace', () => {
  it('makes new packs with free ids that load on the default pack', () => {
    expect(slugify('My Cool Pack!')).toBe('my-cool-pack')
    expect(slugify('3 kings')).toBe('pack-3-kings')
    expect(uniqueId('default', [])).toBe('default-2')
    const a = newPack('Brawl', [])
    const b = newPack('Brawl', [a.id])
    expect([a.id, b.id]).toEqual(['brawl', 'brawl-2'])
    expect(validatePack(a.json)).toEqual([])
    const c = duplicatePack(a, [a.id, b.id])
    expect(c.id).toBe('brawl-3')
    expect(c.json).toMatchObject({ id: 'brawl-3', name: 'Brawl copy' })
  })

  it('reports problems at the path in the pack', () => {
    const wp = newPack('Bad', [])
    const json = setIn(wp.json, ['moves', 'jab'], { ...(defaultFor(moveSchema) as object), damage: -1 })
    expect(validatePack(json as Record<string, unknown>)).toContainEqual(expect.objectContaining({ path: 'moves.jab.damage' }))
  })

  it('round-trips a bundle with its assets, upgrading the pack', async () => {
    const zip = await sample()
    const r = await importBundle(zip, ['skeleton-remix'])
    if (!r.ok) throw new Error(r.errors[0].message)
    const wp = r.value
    expect(wp.id).toBe('skeleton-remix-2')
    expect(wp.json.schemaVersion).toBe(3)
    expect(Object.keys(wp.files)).toEqual(['models/skeleton-warrior.glb'])
    const back = await readBundle(await exportBundle(editPack(wp, { ...wp.json, name: 'Bones' })))
    if (!back.ok) throw new Error(back.errors[0].message)
    expect(back.value.pack).toMatchObject({ id: 'skeleton-remix-2', name: 'Bones' })
    expect(back.value.files.size).toBe(1)
  })

  it('saves to a store, newest first', async () => {
    const store = memoryStore()
    await store.put(newPack('One', [], 1))
    await store.put(newPack('Two', [], 2))
    expect((await store.list()).map((p) => p.id)).toEqual(['two', 'one'])
    await store.delete('two')
    expect((await store.list()).map((p) => p.id)).toEqual(['one'])
  })
})

describe('content tree', () => {
  const blank = () => newPack('T', []).json
  const find = (json: Record<string, unknown>, key: string) => buildTree(json).find((n) => n.key === key)!

  it('shows the default pack as inherited until overridden', () => {
    const json = blank()
    const player = find(json, 'settings/player')
    expect(player.status).toBe('inherited')
    expect(nodeValue(json, player)).toMatchObject({ maxHealth: expect.any(Number) })

    const edited = setIn(overrideNode(json, player), ['settings', 'player', 'maxHealth'], 999) as Record<string, unknown>
    expect(find(edited, 'settings/player').status).toBe('override')
    expect(validatePack(edited)).toEqual([])
    expect(removeNode(edited, find(edited, 'settings/player'))).toEqual({ ...json, settings: {} })
  })

  it('overrides a default level in place and adds new ones after', () => {
    let json = blank()
    json = overrideNode(json, find(json, 'levels/level-2'))
    expect((json.levels as { id: string }[]).map((l) => l.id)).toEqual(['level-2'])
    const added = addNode(json, 'levels', nodeValue(json, find(json, 'levels/level-1')))
    expect(added.key).toBe('levels/new-level#1')
    expect(validatePack(added.json)).toEqual([])
    expect(buildTree(added.json).filter((n) => n.group === 'levels').map((n) => n.status)).toEqual(['inherited', 'override', 'own'])
  })

  it('adds a new record with a free id', () => {
    const json = blank()
    const { json: next, key } = addNode(json, 'moves', nodeValue(json, find(json, 'moves/jab')))
    expect(key).toBe('moves/new-move')
    expect(find(next, key).status).toBe('own')
    expect(validatePack(next)).toEqual([])
  })
})

describe('fighter tools', () => {
  const glb = () => {
    const b = new Uint8Array(32)
    b.set([0x67, 0x6c, 0x54, 0x46])
    return b
  }

  it('imports a .glb as a pack asset that exports and validates', async () => {
    const wp = newPack('Models', [])
    const r = addModelAsset(wp, 'Hero Model.glb', glb())
    if (!r.ok) throw new Error(r.message)
    expect(r.assetId).toBe('hero-model')
    expect(r.pack.files).toHaveProperty(['models/hero-model.glb'])
    expect(addModelAsset(r.pack, 'Hero Model.glb', glb()).ok && 'second').toBe('second')
    expect(addModelAsset(wp, 'x.glb', new Uint8Array(32))).toEqual({ ok: false, message: '"x.glb" isn\'t a binary glTF (.glb) file' })

    const json = setIn(r.pack.json, ['settings', 'player'], { ...baseContent().settings.player, model: gltfModelFor(r.assetId) })
    const withModel = editPack(r.pack, json as Record<string, unknown>)
    expect(validatePack(withModel.json)).toEqual([])
    const back = await readBundle(await exportBundle(withModel))
    expect(back.ok).toBe(true)
    expect(assetFile(withModel, 'hero-model')).toEqual(glb())
    expect(removeAsset(withModel, 'hero-model').files).toEqual({})
  })

  it('fits a model to the body', () => {
    expect(fitModel(0, 4, 1)).toEqual({ scale: 0.5, offset: [0, -1, 0] })
    expect(fitModel(-1, 1, 1)).toEqual({ scale: 1, offset: [0, 0, 0] })
  })

  it('times moves in phases and frames', () => {
    const m = { startup: 0.05, active: 0.1, recovery: 0.15 }
    expect([phaseAt(m, 0), phaseAt(m, 0.07), phaseAt(m, 0.2), phaseAt(m, 0.3)]).toEqual(['startup', 'active', 'recovery', 'recovery'])
    expect(moveFrames(m)).toBe(18)
  })

  it('reads and rewrites the light-attack combo', () => {
    const json = newPack('C', []).json
    expect(comboChain(json)).toEqual(['jab', 'jab2', 'hook', 'uppercut'])
    const next = setComboChain(json, ['jab', 'hook'])
    expect(comboChain(next)).toEqual(['jab', 'hook'])
    expect(Object.keys(next.moves as object).sort()).toEqual(['hook', 'jab'])
    expect((next.moves as Record<string, { next?: string }>).hook.next).toBeUndefined()
    expect(validatePack(next)).toEqual([])
    const reordered = setComboChain(json, ['hook', 'jab'])
    expect(comboChain(reordered)).toEqual(['hook', 'jab'])
    expect(validatePack(reordered)).toEqual([])
  })
})

describe('sandbox', () => {
  it('makes a valid arena of N enemies near the player', () => {
    const level = sandboxLevel('HEAVY', 3)
    expect(validateLevel(level)).toEqual([])
    const wave = level.segments[0].triggers[0]
    if (wave.kind !== 'wave') throw new Error()
    expect(wave.waves[0].enemies.map((e) => e.x)).toEqual([4, 5, 6])
    expect(sandboxLevel('X', 99).segments[0].triggers[0]).toMatchObject({ waves: [{ enemies: expect.any(Array) }] })
    // A pack whose enemy type it names loads with it.
    const json = { ...newPack('S', []).json, levels: [level] }
    expect(validatePack(json)).toEqual([])
    expect(validatePack({ ...json, levels: [sandboxLevel('NOPE', 1)] })).not.toEqual([])
  })
})
