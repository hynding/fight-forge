import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../store/gameStore'
import { getConfig, getLevels } from './active'
import { writeBundle } from './bundle'
import { bundleFromFolder } from './bundleFolder'
import { DEFAULT_CONTENT } from './defaultContent'
import { installBundle, loadActivePacks, packBundleBytes, removePack, setPackEnabled } from './library'

const SAMPLE = join(__dirname, '../../content/samples/skeleton-remix')
const sample = () => bundleFromFolder(SAMPLE, (p) => new Uint8Array(readFileSync(p)), (f) => readdirSync(f))

const tiny = (id: string, extra: Record<string, unknown> = {}) =>
  writeBundle({
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    meta: { author: 'Tester', description: '', license: 'CC0-1.0' },
    ...extra,
  })

afterEach(() => {
  for (const p of useGameStore.getState().packs) removePack(p.id)
})

describe('pack library', () => {
  it('installs a bundle, enables it, and makes it the active content', async () => {
    const zip = await sample()
    const r = await installBundle(zip)
    expect(r.ok).toBe(true)
    expect(useGameStore.getState().packs).toEqual([
      expect.objectContaining({ id: 'skeleton-remix', name: 'Skeleton Remix', version: '1.0.0', enabled: true }),
    ])
    expect(useGameStore.getState().contentError).toBeNull()
    expect(getConfig().player.maxHealth).toBe(120)
    const model = getConfig().player.model
    expect(model.kind === 'gltf' && model.url.startsWith('blob:')).toBe(true)
    expect(getLevels().map((l) => l.id)).toContain('crypt')
    expect(packBundleBytes('skeleton-remix')).toBe(zip)
  })

  it('turns a pack off and on, and removes it', async () => {
    await installBundle(await sample())
    setPackEnabled('skeleton-remix', false)
    expect(getConfig()).toEqual(DEFAULT_CONTENT.config)
    expect(useGameStore.getState().packs[0].enabled).toBe(false)
    setPackEnabled('skeleton-remix', true)
    expect(getLevels()).toHaveLength(DEFAULT_CONTENT.levels.length + 1)
    removePack('skeleton-remix')
    expect(useGameStore.getState().packs).toEqual([])
    expect(getLevels()).toEqual(DEFAULT_CONTENT.levels)
  })

  it('a new version of a pack replaces the old one', async () => {
    await installBundle(await tiny('extra', { settings: { scoring: { enemyKill: 1 } } }))
    await installBundle(await tiny('extra', { version: '1.1.0', settings: { scoring: { enemyKill: 2 } } }))
    expect(useGameStore.getState().packs.map((p) => [p.id, p.version])).toEqual([['extra', '1.1.0']])
    expect(getConfig().scoring.enemyKill).toBe(2)
  })

  it('later packs win, in install order', async () => {
    await installBundle(await tiny('a', { settings: { scoring: { enemyKill: 1 } } }))
    await installBundle(await tiny('b', { settings: { scoring: { enemyKill: 2 } } }))
    expect(getConfig().scoring.enemyKill).toBe(2)
    setPackEnabled('b', false)
    expect(getConfig().scoring.enemyKill).toBe(1)
  })

  it('refuses the built-in id and packs that break with the current set', async () => {
    const own = await installBundle(await tiny('default'))
    expect(own.ok).toBe(false)
    const broken = await installBundle(await tiny('broken', { enemyTypes: {} , levels: [{ id: 'x', name: 'X', segments: [{ length: 5, triggers: [] }] }] }))
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors[0]).toMatchObject({ pack: 'broken', path: 'levels.x' })
    expect(useGameStore.getState().packs).toEqual([])
  })

  it('reports packs that conflict once both are enabled', async () => {
    // `needs-move` uses a move that only `has-move` defines; disabling `has-move` breaks it.
    const move = { ...DEFAULT_CONTENT.config.moves.jab, damage: 1 }
    await installBundle(await tiny('has-move', { moves: { poke: move } }))
    await installBundle(await tiny('needs-move', { settings: { player: { ...DEFAULT_CONTENT.config.player, lightAttack: 'poke' } } }))
    expect(loadActivePacks().ok).toBe(true)
    setPackEnabled('has-move', false)
    expect(useGameStore.getState().contentError).toBe('[needs-move] settings.player.lightAttack: unknown move "poke"')
    setPackEnabled('has-move', true)
    expect(useGameStore.getState().contentError).toBeNull()
  })
})
