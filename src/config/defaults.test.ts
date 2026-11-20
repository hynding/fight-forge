import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { EnemyType } from '../types/game'
import { MAX_FRAME_STEP } from '../utils/gameTime'

describe('DEFAULT_CONFIG', () => {
  it('matches the snapshot (update it deliberately when retuning)', () => {
    expect(DEFAULT_CONFIG).toMatchSnapshot()
  })

  it('defines every enemy type', () => {
    for (const type of Object.values(EnemyType)) {
      expect(DEFAULT_CONFIG.enemyTypes[type]).toBeDefined()
    }
  })

  it('only spawns defined enemy types', () => {
    const { spawning, enemyTypes } = DEFAULT_CONFIG
    for (const type of [spawning.initialType, ...spawning.types]) {
      expect(enemyTypes[type]).toBeDefined()
    }
  })

  it('keeps the player swing longer than one clamped frame step', () => {
    // gameStep's clamp must stay below the shortest timer, or one long frame
    // could start and end a swing before combat sees it.
    expect(DEFAULT_CONFIG.player.attack.duration).toBeGreaterThan(MAX_FRAME_STEP)
  })

  it('keeps the avoidance blend between 0 and 1', () => {
    expect(DEFAULT_CONFIG.enemy.avoidanceWeight).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CONFIG.enemy.avoidanceWeight).toBeLessThanOrEqual(1)
  })
})
