import { describe, expect, it } from 'vitest'
import { readBundle } from '../content/bundle'
import { addImageAsset, assetUsage, setCover } from './assets'
import { bindKey, unbindKey } from './bindings'
import { addModelAsset, gltfModelFor } from './fighter'
import { setIn } from './paths'
import { exportBundle, newPack, validatePack, type PackJson } from './workspace'
import { DEFAULT_CONTENT } from '../content/defaultContent'
import { tinyGlb } from '../test/glb'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const GLB = tinyGlb()

describe('forge pack assets', () => {
  it('adds a cover image that survives export and import', async () => {
    const r = addImageAsset(newPack('Cover test', []), 'My Cover.PNG', PNG)
    if (!r.ok) throw new Error(r.message)
    expect(r.assetId).toBe('my-cover')
    expect(r.pack.json.assets).toEqual([{ id: 'my-cover', kind: 'texture', path: 'images/my-cover.png' }])
    const wp = { ...r.pack, json: setCover(r.pack.json, r.assetId) }
    expect(validatePack(wp.json)).toEqual([])
    const read = await readBundle(await exportBundle(wp))
    expect(read.ok && read.value.pack.meta.cover).toBe('my-cover')
    expect(setCover(wp.json, undefined).meta).not.toHaveProperty('cover')
  })

  it('refuses files that are not images', () => {
    const r = addImageAsset(newPack('x', []), 'cover.png', GLB)
    expect(r.ok).toBe(false)
  })

  it('refuses a bundle whose texture is not an image', async () => {
    const r = addImageAsset(newPack('Bad', []), 'c.png', PNG)
    if (!r.ok) throw new Error(r.message)
    const files = { ...r.pack.files, 'images/c.png': GLB }
    const read = await readBundle(await exportBundle({ ...r.pack, files }))
    expect(read.ok).toBe(false)
  })

  it('finds where each asset is used', () => {
    const m = addModelAsset(newPack('Uses', []), 'hero.glb', GLB)
    if (!m.ok) throw new Error(m.message)
    let json: PackJson = setIn(m.pack.json, ['settings', 'player'], { ...DEFAULT_CONTENT.config.player, model: gltfModelFor('hero') }) as PackJson
    json = setCover(json, 'hero')
    expect(assetUsage(json).get('hero')).toEqual(['settings.player.model', 'meta.cover'])
    expect(assetUsage(m.pack.json).get('hero')).toBeUndefined()
  })
})

describe('forge key bindings', () => {
  const base = DEFAULT_CONTENT.config.input.bindings
  it('binds a key to one action only', () => {
    const b = bindKey(base, 'jump', 'J')
    expect(b.jump).toContain('j')
    expect(b.attack).not.toContain('j')
    expect(bindKey(b, 'jump', 'j').jump.filter((k) => k === 'j')).toHaveLength(1)
  })
  it('unbinds a key', () => {
    expect(unbindKey(base, 'attack', 'j').attack).not.toContain('j')
  })
})
