import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { audioType, BUNDLE_LIMITS, glbProblem, isLocalUrl, readBundle, sha256, writeBundle } from './bundle'
import { bundleFromFolder } from './bundleFolder'
import { defaultPack } from './defaultPack'
import { loadContent } from './load'
import { migratePack } from './migrations'
import { buildRegistry, formatErrors, parsePack } from './registry'
import type { ContentError, Result } from './registry'
import { tinyGlb } from '../test/glb'

const SAMPLE = join(__dirname, '../../content/samples/skeleton-remix')
const sampleBundle = () =>
  bundleFromFolder(SAMPLE, (p) => new Uint8Array(readFileSync(p)), (f) => readdirSync(f))

/** A tiny valid .glb of about `n` bytes. */
const fakeGlb = (n = 64) => tinyGlb({}, n)

const pack = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'mini',
  name: 'Mini',
  version: '1.0.0',
  meta: { author: 'Tester', description: '', license: 'CC0-1.0' },
  ...extra,
})

const withModel = (extra: Record<string, unknown> = {}) =>
  pack({
    assets: [{ id: 'hero', kind: 'model', path: 'models/hero.glb' }],
    settings: {
      player: { ...DEFAULT_CONFIG.player, model: { ...DEFAULT_CONFIG.player.model, url: undefined, asset: 'hero' } },
    },
    ...extra,
  })

const errorsOf = async (r: Promise<Result<unknown>>): Promise<ContentError[]> => {
  const v = await r
  if (v.ok) throw new Error('expected the bundle to be rejected')
  return v.errors
}

/** Rewrite one file inside a zip. */
const patchZip = (zip: Uint8Array, patch: (files: Record<string, Uint8Array>) => void) => {
  const files = unzipSync(zip)
  patch(files)
  return zipSync(files)
}

describe('sha256', () => {
  it('hashes bytes as hex', async () => {
    expect(await sha256(strToU8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('writeBundle / readBundle', () => {
  it('round-trips a pack and its assets, filling in sizes and hashes', async () => {
    const glb = fakeGlb()
    const zip = await writeBundle(withModel(), new Map([['models/hero.glb', glb]]))
    const r = await readBundle(zip)
    if (!r.ok) throw new Error(formatErrors(r.errors))
    expect(r.value.pack.id).toBe('mini')
    expect(r.value.pack.assets[0]).toEqual({
      id: 'hero',
      kind: 'model',
      path: 'models/hero.glb',
      bytes: glb.length,
      hash: await sha256(glb),
    })
    expect(r.value.files.get('hero')).toEqual(glb)
  })

  it('refuses to write an asset without its file', async () => {
    await expect(writeBundle(withModel())).rejects.toThrow('no file for asset "hero"')
  })

  it('bundles the default pack (no assets) as a valid starting point', async () => {
    const r = await readBundle(await writeBundle(defaultPack()))
    expect(r.ok).toBe(true)
  })
})

describe('the sample remix pack', () => {
  it('loads from its bundle on top of the default pack', async () => {
    const zip = await sampleBundle()
    const r = await readBundle(zip)
    if (!r.ok) throw new Error(formatErrors(r.errors))
    const content = loadContent([defaultPack(), r.value.json], (a) => `blob:${a.id}`)
    if (!content.ok) throw new Error(content.error)
    const { config, levels } = content.value

    // Changes stats...
    expect(config.player.maxHealth).toBe(120)
    expect(config.enemyTypes.HEAVY.maxHealth).toBe(140)
    expect(config.rules.lives).toBe(4)
    // ...swaps in a different character model from the bundle...
    expect(config.player.model.kind === 'gltf' && config.player.model.url).toBe('blob:skeleton-warrior')
    expect(config.enemyTypes.SKELETON.model.kind === 'gltf' && config.enemyTypes.SKELETON.model.url).toBe('blob:skeleton-warrior')
    // ...keeps the default enemies' robot model...
    expect(config.enemyTypes.BASIC.model).toEqual(DEFAULT_CONFIG.enemyTypes.BASIC.model)
    // ...and adds a level after the built-in ones.
    expect(levels.map((l) => l.id)).toEqual(['level-1', 'level-2', 'crypt'])
  })

  it('ships a real .glb under its size limit, with its licence', async () => {
    const files = unzipSync(await sampleBundle())
    expect(Object.keys(files).sort()).toEqual(['models/LICENSE-KayKit.txt', 'models/skeleton-warrior.glb', 'pack.json'])
    expect(files['models/skeleton-warrior.glb'].length).toBeLessThan(BUNDLE_LIMITS.model)
  })
})

describe('bad bundles', () => {
  const good = () => writeBundle(withModel(), new Map([['models/hero.glb', fakeGlb()]]))

  it('rejects a file that is not a zip', async () => {
    expect(await errorsOf(readBundle(strToU8('hello')))).toEqual([{ path: '(bundle)', message: 'not a valid zip file' }])
  })

  it('needs pack.json at the top', async () => {
    const zip = zipSync({ 'inner/pack.json': strToU8('{}') })
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('no pack.json at the top of the zip')
  })

  it('reports broken JSON', async () => {
    const zip = zipSync({ 'pack.json': strToU8('{ "id": ') })
    const [e] = await errorsOf(readBundle(zip))
    expect(e.path).toBe('pack.json')
    expect(e.message).toMatch(/^isn't valid JSON/)
  })

  it('reports schema errors with the pack id', async () => {
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(pack({ version: 'one' }))) })
    expect(await errorsOf(readBundle(zip))).toEqual([{ pack: 'mini', path: 'version', message: 'must be a version like 1.0.0' }])
  })

  it('catches a changed asset file', async () => {
    const zip = patchZip(await good(), (f) => {
      f['models/hero.glb'][20] = 7
    })
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('"models/hero.glb" doesn\'t match its hash (corrupted or changed)')
  })

  it('catches a size that does not match the pack', async () => {
    const zip = patchZip(await good(), (f) => {
      f["models/hero.glb"] = fakeGlb(68)
    })
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('"models/hero.glb" is 68 bytes, but the pack says 64')
  })

  it('catches a missing asset file', async () => {
    const zip = patchZip(await good(), (f) => {
      delete f['models/hero.glb']
    })
    expect(await errorsOf(readBundle(zip))).toEqual([
      { pack: 'mini', path: 'assets[0]', message: 'file "models/hero.glb" is missing from the bundle' },
    ])
  })

  it('needs sizes and hashes on bundled assets', async () => {
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(withModel())), 'models/hero.glb': fakeGlb() })
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('a bundled asset needs "bytes" and "hash"')
  })

  it('only takes binary glTF models', async () => {
    const zip = await writeBundle(withModel(), new Map([['models/hero.glb', strToU8('{"asset":{}}')]]))
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('"models/hero.glb" isn\'t a binary glTF (.glb)')
  })

  it('checks a model is a whole, self-contained glTF 2.0 file', async () => {
    const real = new Uint8Array(readFileSync(join(__dirname, '../../public/models/robot-expressive.glb')))
    expect(glbProblem(real)).toBeNull()
    expect(glbProblem(tinyGlb())).toBeNull()
    expect(glbProblem(tinyGlb({ buffers: [{ uri: 'data:application/octet-stream;base64,AA==', byteLength: 1 }] }))).toBeNull()
    expect(glbProblem(tinyGlb({ images: [{ uri: 'https://tracker.example/x.png' }] }))).toBe(
      'refers to an outside file ("https://tracker.example/x.png"); embed everything in the .glb'
    )
    expect(glbProblem(tinyGlb({ buffers: [{ uri: 'hero.bin', byteLength: 4 }] }))).toMatch(/outside file/)
    expect(glbProblem(tinyGlb({ asset: { version: '1.0' } }))).toBe("isn't glTF 2.0")
    expect(glbProblem(tinyGlb().subarray(0, 24))).toMatch(/cut short/)
    const v1 = tinyGlb()
    v1[4] = 1
    expect(glbProblem(v1)).toBe('is glTF version 1; only glTF 2 is supported')
    const badJson = tinyGlb()
    badJson[20] = 0x7d // '}'
    expect(glbProblem(badJson)).toBe('has a glTF JSON chunk that is not valid JSON')
  })

  it('recognises audio files', () => {
    expect(audioType(strToU8('OggS....'))).toBe('ogg')
    expect(audioType(strToU8('RIFF....WAVEfmt '))).toBe('wav')
    expect(audioType(strToU8('ID3....'))).toBe('mp3')
    expect(audioType(new Uint8Array([0xff, 0xfb, 0x90]))).toBe('mp3')
    expect(audioType(strToU8('<script>'))).toBeNull()
  })

  it('rejects asset paths that climb out of the bundle', async () => {
    const bad = withModel({ assets: [{ id: 'hero', kind: 'model', path: '../hero.glb' }] })
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(bad)) })
    expect((await errorsOf(readBundle(zip)))[0].message).toBe('path "../hero.glb" must be relative, without ".."')
  })

  it('rejects model URLs off this site', async () => {
    const remote = pack({
      settings: { player: { ...DEFAULT_CONFIG.player, model: { ...DEFAULT_CONFIG.player.model, url: 'https://example.com/a.glb' } } },
    })
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(remote)) })
    const [e] = await errorsOf(readBundle(zip))
    expect(e.path).toBe('settings.player.model.url')
  })

  it('refuses oversized files without inflating them', async () => {
    const big = new Uint8Array(BUNDLE_LIMITS.model + 1)
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(pack())), 'models/huge.glb': big })
    expect((await errorsOf(readBundle(zip)))[0]).toEqual({
      path: 'models/huge.glb',
      message: `${big.length} bytes is over the ${BUNDLE_LIMITS.model}-byte limit`,
    })
  })

  it('refuses too many files', async () => {
    const files: Record<string, Uint8Array> = { 'pack.json': strToU8(JSON.stringify(pack())) }
    for (let i = 0; i < BUNDLE_LIMITS.files; i++) files[`f${i}.txt`] = strToU8('x')
    expect((await errorsOf(readBundle(zipSync(files))))[0].message).toMatch(/files; the limit is/)
  })

  it('rejects a pack from a newer schema version', async () => {
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(pack({ schemaVersion: 4 }))) })
    expect((await errorsOf(readBundle(zip)))[0]).toEqual({
      pack: 'mini',
      path: 'schemaVersion',
      message: 'made for schema version 4, but this build reads up to 3; update the game to load it',
    })
  })
})

describe('isLocalUrl', () => {
  it.each([
    ['/models/robot.glb', true],
    ['models/robot.glb', false],
    ['//evil.example/a.glb', false],
    ['https://example.com/a.glb', false],
    ['/\\evil', false],
  ])('%s → %s', (url, ok) => expect(isLocalUrl(url)).toBe(ok))
})

describe('migratePack', () => {
  // A pretend history: v1 called the pack name "title", v2 renamed it.
  const table = {
    1: (p: Record<string, unknown>) => {
      const { title, ...rest } = p
      return { ...rest, name: title }
    },
    2: (p: Record<string, unknown>) => ({ ...p, meta: { ...(p.meta as object), license: 'CC0-1.0' } }),
  }

  it('upgrades a pack step by step to the current version', () => {
    const r = migratePack({ schemaVersion: 1, title: 'Old', meta: {} }, table, 3)
    expect(r).toEqual({ ok: true, value: { schemaVersion: 3, name: 'Old', meta: { license: 'CC0-1.0' } } })
  })

  it('leaves a current pack alone', () => {
    const p = { schemaVersion: 3, name: 'New' }
    expect(migratePack(p, table, 3)).toEqual({ ok: true, value: p })
  })

  it('reports a gap in the table', () => {
    expect(migratePack({ schemaVersion: 0 }, table, 3)).toEqual({ ok: false, message: 'no migration from schema version 0 to 1' })
  })

  it('passes non-packs through for the schema to report', () => {
    expect(migratePack('nope')).toEqual({ ok: true, value: 'nope' })
    expect(parsePack({ name: 'x' }).ok).toBe(false)
  })

  it('runs as part of parsing (the current version needs no steps)', () => {
    expect(buildRegistry([defaultPack()]).ok).toBe(true)
  })
})
