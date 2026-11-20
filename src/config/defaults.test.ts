import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { EnemyType } from '../types/game'
import { SIM_STEP } from '../sim/loop'
import { validateMoves } from '../sim/moves'
import { DEFAULT_LEVEL } from './levels'

describe('DEFAULT_CONFIG', () => {
  it('matches the snapshot (update it deliberately when retuning)', () => {
    expect(DEFAULT_CONFIG).toMatchSnapshot()
  })

  it('defines every enemy type', () => {
    for (const type of Object.values(EnemyType)) {
      expect(DEFAULT_CONFIG.enemyTypes[type]).toBeDefined()
    }
  })

  it('only spawns defined enemy types in the shipped level', () => {
    const types = DEFAULT_LEVEL.segments
      .flatMap((s) => s.triggers)
      .flatMap((t) => (t.kind === 'wave' ? t.waves.flatMap((w) => w.enemies.map((e) => e.type)) : []))
    for (const type of types) expect(DEFAULT_CONFIG.enemyTypes[type]).toBeDefined()
  })

  it('has valid moves, and every move it references exists', () => {
    const { moves, player, enemy } = DEFAULT_CONFIG
    expect(validateMoves(moves, [player.lightAttack, enemy.attackMove])).toEqual([])
  })

  it('keeps every hitbox out for at least one sim step, so combat sees it', () => {
    for (const m of Object.values(DEFAULT_CONFIG.moves)) {
      expect(m.active).toBeGreaterThanOrEqual(SIM_STEP)
    }
  })

  it('keeps the avoidance blend between 0 and 1', () => {
    expect(DEFAULT_CONFIG.enemy.avoidanceWeight).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CONFIG.enemy.avoidanceWeight).toBeLessThanOrEqual(1)
  })
})
