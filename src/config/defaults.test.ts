import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { SIM_STEP } from '../sim/loop'
import { validateMoves } from '../sim/moves'
import { LEVELS } from './levels'
import { validateLevel } from '../sim/level'

describe('DEFAULT_CONFIG', () => {
  it('matches the snapshot (update it deliberately when retuning)', () => {
    expect(DEFAULT_CONFIG).toMatchSnapshot()
  })

  it('defines every enemy type', () => {
    for (const type of ['BASIC', 'FAST', 'HEAVY', 'FLANKER']) {
      expect(DEFAULT_CONFIG.enemyTypes[type]).toBeDefined()
    }
  })

  it('ships valid levels with unique ids', () => {
    for (const level of LEVELS) expect(validateLevel(level)).toEqual([])
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length)
  })

  it('only uses defined pickups in levels and enemy drops', () => {
    const names = [
      ...LEVELS.flatMap((l) => l.segments.flatMap((s) => (s.items ?? []).map((i) => i.pickup))),
      ...Object.values(DEFAULT_CONFIG.enemyTypes).flatMap((t) => (t.drop ? [t.drop.pickup] : [])),
    ]
    for (const name of names) expect(DEFAULT_CONFIG.pickups[name]).toBeDefined()
  })

  it('only spawns defined enemy types in the shipped levels', () => {
    const types = LEVELS.flatMap((l) => l.segments)
      .flatMap((s) => s.triggers)
      .flatMap((t) => (t.kind === 'wave' ? t.waves.flatMap((w) => w.enemies.map((e) => e.type)) : []))
    for (const type of types) expect(DEFAULT_CONFIG.enemyTypes[type]).toBeDefined()
  })

  it('has valid moves, and every move it references exists', () => {
    const { moves, player, enemy } = DEFAULT_CONFIG
    const enemyMoves = Object.values(DEFAULT_CONFIG.enemyTypes).flatMap((t) => (t.attackMove ? [t.attackMove] : []))
    expect(
      validateMoves(moves, [
        player.lightAttack,
        player.jumpAttack,
        player.dashAttack,
        enemy.attackMove,
        ...enemyMoves,
      ])
    ).toEqual([])
  })

  it('gives every enemy type a defined AI archetype', () => {
    for (const t of Object.values(DEFAULT_CONFIG.enemyTypes)) expect(DEFAULT_CONFIG.ai[t.ai]).toBeDefined()
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
