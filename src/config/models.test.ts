import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, PROCEDURAL_MODEL } from './defaults'
import { gltfModelUrls } from './models'

describe('gltfModelUrls', () => {
  it('lists each glTF once', () => {
    expect(gltfModelUrls(DEFAULT_CONFIG)).toEqual(['/models/robot-expressive.glb'])
  })

  it('skips procedural models', () => {
    const config = {
      ...DEFAULT_CONFIG,
      player: { ...DEFAULT_CONFIG.player, model: PROCEDURAL_MODEL },
      enemyTypes: Object.fromEntries(
        Object.entries(DEFAULT_CONFIG.enemyTypes).map(([k, v]) => [k, { ...v, model: PROCEDURAL_MODEL }])
      ) as typeof DEFAULT_CONFIG.enemyTypes,
    }
    expect(gltfModelUrls(config)).toEqual([])
  })
})
