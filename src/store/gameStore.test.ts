import { beforeEach, describe, expect, it } from 'vitest'
import { isFrozen, useGameStore, type Enemy } from './gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'

const makeEnemy = (id: string, health = 50): Enemy => ({
  id,
  type: 'BASIC',
  health,
  maxHealth: health,
  position: [0, 2, 0],
})

const initialState = useGameStore.getState()

/** Loses the last life: game over. */
const killPlayer = () => {
  useGameStore.setState({ lives: 1 })
  useGameStore.getState().damagePlayer(1000)
}

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
    expect(score).toBe(DEFAULT_CONFIG.scoring.enemyKill)
  })

  it('releases the attack token and queue place when an enemy dies', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.spawnEnemy(makeEnemy('b', 10))
    expect(s.requestAttackToken('a')).toBe(true)
    expect(s.requestAttackToken('b')).toBe(false)
    s.damageEnemy('b', 10)
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackTokens).toEqual({ holders: [], waiting: [] })
  })

  it('keeps another enemy holding its token', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.spawnEnemy(makeEnemy('b'))
    s.requestAttackToken('b')
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackTokens.holders).toEqual(['b'])
  })

  it('limits attackers to enemy.maxSimultaneousAttackers', () => {
    const s = useGameStore.getState()
    const max = DEFAULT_CONFIG.rules.maxSimultaneousAttackers
    const granted = ['a', 'b', 'c', 'd'].filter((id) => s.requestAttackToken(id))
    expect(granted).toHaveLength(max)
    s.releaseAttackToken(granted[0])
    expect(useGameStore.getState().attackTokens.holders).toHaveLength(max - 1)
  })

  it('does nothing after game over', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    killPlayer()
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().enemies).toHaveLength(1)
    expect(useGameStore.getState().score).toBe(0)
  })
})

describe('damagePlayer', () => {
  it('clamps at 0 and sets game over on the last life', () => {
    useGameStore.setState({ lives: 1 })
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
    killPlayer()
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
    killPlayer()
    const prevGameId = useGameStore.getState().gameId

    useGameStore.getState().resetGame()
    const state = useGameStore.getState()
    expect(state.playerHealth).toBe(state.playerMaxHealth)
    expect(state.score).toBe(0)
    expect(state.enemies).toEqual([])
    expect(state.isGameOver).toBe(false)
    expect(state.isPaused).toBe(false)
    expect(state.attackTokens).toEqual({ holders: [], waiting: [] })
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
    s.completeLevel(42)
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
    useGameStore.getState().completeLevel(42)
    useGameStore.getState().resetGame()
    expect(useGameStore.getState().levelProgress.complete).toBe(false)
  })
})

describe('lives and continues', () => {
  it('loses a life and respawns at full health while lives remain', () => {
    const s = useGameStore.getState()
    s.damagePlayer(1000)
    const after = useGameStore.getState()
    expect(after.lives).toBe(DEFAULT_CONFIG.rules.lives - 1)
    expect(after.playerHealth).toBe(after.playerMaxHealth)
    expect(after.respawnCount).toBe(1)
    expect(after.isGameOver).toBe(false)
  })

  it('is game over on the last life, then a continue restores lives in place', () => {
    for (let i = 0; i < DEFAULT_CONFIG.rules.lives; i++) useGameStore.getState().damagePlayer(1000)
    expect(useGameStore.getState().isGameOver).toBe(true)
    useGameStore.setState({ score: 700 })
    useGameStore.getState().continueGame()
    const after = useGameStore.getState()
    expect(after.isGameOver).toBe(false)
    expect(after.lives).toBe(DEFAULT_CONFIG.rules.lives)
    expect(after.continuesLeft).toBe(DEFAULT_CONFIG.rules.continues - 1)
    expect(after.score).toBe(700)
  })

  it('has no continue left after using them all', () => {
    useGameStore.setState({ continuesLeft: 0 })
    killPlayer()
    useGameStore.getState().continueGame()
    expect(useGameStore.getState().isGameOver).toBe(true)
  })
})

describe('runs and levels', () => {
  it('counts KOs per level and per run', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().kos).toBe(1)
    expect(useGameStore.getState().runKos).toBe(1)
  })

  it('goes to the next level keeping score, lives and run KOs', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.damageEnemy('a', 10)
    s.damagePlayer(1000) // lose a life
    s.completeLevel(30)
    const before = useGameStore.getState()
    before.nextLevel()
    const after = useGameStore.getState()
    expect(after.levelIndex).toBe(1)
    expect(after.score).toBe(before.score)
    expect(after.lives).toBe(before.lives)
    expect(after.runKos).toBe(1)
    expect(after.kos).toBe(0)
    expect(after.levelProgress.complete).toBe(false)
    expect(after.gameId).toBe(before.gameId + 1)
  })

  it('only advances from a completed level', () => {
    useGameStore.getState().nextLevel()
    expect(useGameStore.getState().levelIndex).toBe(0)
  })

  it('starts a fresh run at any level through the loading screen', () => {
    useGameStore.setState({ score: 500, lives: 1 })
    useGameStore.getState().startRun(1)
    const s = useGameStore.getState()
    expect(s.levelIndex).toBe(1)
    expect(s.score).toBe(0)
    expect(s.lives).toBe(DEFAULT_CONFIG.rules.lives)
    expect(s.gameScreen).toBe('loading')
  })

  it('records the level time on completion', () => {
    useGameStore.getState().completeLevel(83)
    expect(useGameStore.getState().levelProgress.time).toBe(83)
  })
})

describe('pickups', () => {
  it('heals on collection, once, and ignores duplicate spawns', () => {
    const s = useGameStore.getState()
    s.damagePlayer(50)
    s.spawnPickup({ id: 'p1', pickup: 'food', x: 0, z: 0 })
    s.spawnPickup({ id: 'p1', pickup: 'food', x: 0, z: 0 })
    expect(useGameStore.getState().pickups).toHaveLength(1)
    s.collectPickup('p1')
    s.collectPickup('p1')
    const after = useGameStore.getState()
    expect(after.playerHealth).toBe(after.playerMaxHealth - 50 + DEFAULT_CONFIG.pickups.food.amount)
    expect(after.pickups).toHaveLength(0)
  })

  it('scores coins', () => {
    const s = useGameStore.getState()
    s.spawnPickup({ id: 'c', pickup: 'coin', x: 0, z: 0 })
    s.collectPickup('c')
    expect(useGameStore.getState().score).toBe(DEFAULT_CONFIG.pickups.coin.amount)
  })
})

describe('props', () => {
  const crate = { id: 'c1', prop: 'crate', x: 1, y: 0, z: 0, health: 10 }
  const wall = { id: 'w1', prop: 'wall', x: 2, y: 0, z: 0, health: Infinity }

  it('places each prop once', () => {
    const s = useGameStore.getState()
    s.resetGame()
    s.placeProps([crate, wall])
    s.placeProps([crate])
    expect(useGameStore.getState().props.map((p) => p.id)).toEqual(['c1', 'w1'])
  })

  it('breaks a breakable prop when its health runs out, and never an unbreakable one', () => {
    const s = useGameStore.getState()
    s.resetGame()
    s.placeProps([crate, wall])
    expect(s.damageProp('c1', 6)).toBe(false)
    expect(useGameStore.getState().props.find((p) => p.id === 'c1')?.health).toBe(4)
    expect(s.damageProp('c1', 6)).toBe(true)
    expect(useGameStore.getState().props.map((p) => p.id)).toEqual(['w1'])
    expect(s.damageProp('w1', 999)).toBe(false)
    expect(s.damageProp('missing', 5)).toBe(false)
  })

  it('clears props when the level restarts', () => {
    const s = useGameStore.getState()
    s.placeProps([crate])
    s.resetGame()
    expect(useGameStore.getState().props).toEqual([])
  })
})
