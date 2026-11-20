import { beforeEach, describe, expect, it } from 'vitest'
import { ENEMY_KILL_SCORE, isFrozen, useGameStore, type Enemy } from './gameStore'
import { EnemyType } from '../types/game'

const makeEnemy = (id: string, health = 50): Enemy => ({
  id,
  type: EnemyType.BASIC,
  health,
  maxHealth: health,
  position: [0, 2, 0],
})

const initialState = useGameStore.getState()

beforeEach(() => {
  useGameStore.setState(initialState, true)
})

describe('damageEnemy', () => {
  it('reduces health without removing a surviving enemy', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a'))
    s.damageEnemy('a', 20)
    const { enemies, score } = useGameStore.getState()
    expect(enemies).toHaveLength(1)
    expect(enemies[0].health).toBe(30)
    expect(score).toBe(0)
  })

  it('removes the enemy and awards score exactly once on a kill', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 20))
    s.damageEnemy('a', 20)
    s.damageEnemy('a', 20) // a second hit in the same frame must not score again
    const { enemies, score } = useGameStore.getState()
    expect(enemies).toHaveLength(0)
    expect(score).toBe(ENEMY_KILL_SCORE)
  })

  it('releases the attacker slot when the attacking enemy dies', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.setAttackingEnemy('a')
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackingEnemyId).toBeNull()
  })

  it('keeps another enemy in the attacker slot', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.spawnEnemy(makeEnemy('b'))
    s.setAttackingEnemy('b')
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackingEnemyId).toBe('b')
  })

  it('does nothing after game over', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.damagePlayer(1000)
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().enemies).toHaveLength(1)
    expect(useGameStore.getState().score).toBe(0)
  })
})

describe('damagePlayer', () => {
  it('clamps at 0 and sets game over', () => {
    useGameStore.getState().damagePlayer(150)
    const { playerHealth, isGameOver } = useGameStore.getState()
    expect(playerHealth).toBe(0)
    expect(isGameOver).toBe(true)
  })
})

describe('togglePause', () => {
  it('toggles while playing', () => {
    useGameStore.getState().togglePause()
    expect(useGameStore.getState().isPaused).toBe(true)
    useGameStore.getState().togglePause()
    expect(useGameStore.getState().isPaused).toBe(false)
  })

  it('is ignored once the game is over', () => {
    useGameStore.getState().damagePlayer(1000)
    useGameStore.getState().togglePause()
    expect(useGameStore.getState().isPaused).toBe(false)
  })
})

describe('resetGame', () => {
  it('restores a fresh game and bumps gameId so the scene remounts', () => {
    const s = useGameStore.getState()
    s.setGameScreen('playing')
    s.spawnEnemy(makeEnemy('a'))
    s.addScore(300)
    s.damagePlayer(1000)
    const prevGameId = useGameStore.getState().gameId

    useGameStore.getState().resetGame()
    const state = useGameStore.getState()
    expect(state.playerHealth).toBe(state.playerMaxHealth)
    expect(state.score).toBe(0)
    expect(state.enemies).toEqual([])
    expect(state.isGameOver).toBe(false)
    expect(state.isPaused).toBe(false)
    expect(state.attackingEnemyId).toBeNull()
    expect(state.gameId).toBe(prevGameId + 1)
    expect(state.gameScreen).toBe('playing')
  })

  it('stays on the menu when reset from the menu', () => {
    useGameStore.getState().resetGame()
    expect(useGameStore.getState().gameScreen).toBe('menu')
  })
})

describe('level completion', () => {
  it('freezes the game and blocks further damage and pausing', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a'))
    s.completeLevel()
    const after = useGameStore.getState()
    expect(after.levelProgress.complete).toBe(true)
    expect(isFrozen(after)).toBe(true)
    after.damagePlayer(10)
    after.damageEnemy('a', 100)
    after.togglePause()
    const end = useGameStore.getState()
    expect(end.playerHealth).toBe(end.playerMaxHealth)
    expect(end.enemies).toHaveLength(1)
    expect(end.isPaused).toBe(false)
  })

  it('is cleared by a reset', () => {
    useGameStore.getState().completeLevel()
    useGameStore.getState().resetGame()
    expect(useGameStore.getState().levelProgress.complete).toBe(false)
  })
})
