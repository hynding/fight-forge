import { beforeEach, describe, expect, it } from 'vitest'
import { freshPlayer, isFrozen, playerState, useGameStore, type Enemy, type PlayerState } from './gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'

const makeEnemy = (id: string, health = 50): Enemy => ({
  id,
  type: 'BASIC',
  health,
  maxHealth: health,
  position: [0, 2, 0],
})

const initialState = useGameStore.getState()

/** Player 1's state now. */
const p1 = (): PlayerState => playerState(useGameStore.getState(), 1)!

/** Changes player 1's state. */
const setP1 = (patch: Partial<PlayerState>) =>
  useGameStore.setState((s) => ({ players: s.players.map((p) => (p.slot === 1 ? { ...p, ...patch } : p)) }))

/** Loses the last life: game over. */
const killPlayer = () => {
  setP1({ lives: 1 })
  useGameStore.getState().damagePlayer(1, 1000)
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
    expect(s.requestAttackToken('a', 'p1')).toBe(true)
    expect(s.requestAttackToken('b', 'p1')).toBe(false)
    s.damageEnemy('b', 10)
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackTokens).toEqual({ p1: { holders: [], waiting: [] } })
  })

  it('keeps another enemy holding its token', () => {
    const s = useGameStore.getState()
    s.spawnEnemy(makeEnemy('a', 10))
    s.spawnEnemy(makeEnemy('b'))
    s.requestAttackToken('b', 'p1')
    s.damageEnemy('a', 10)
    expect(useGameStore.getState().attackTokens.p1.holders).toEqual(['b'])
  })

  it('limits attackers to enemy.maxSimultaneousAttackers', () => {
    const s = useGameStore.getState()
    const max = DEFAULT_CONFIG.rules.maxSimultaneousAttackers
    const granted = ['a', 'b', 'c', 'd'].filter((id) => s.requestAttackToken(id, 'p1'))
    expect(granted).toHaveLength(max)
    s.releaseAttackToken(granted[0])
    expect(useGameStore.getState().attackTokens.p1.holders).toHaveLength(max - 1)
  })

  it('limits attackers per player: each player has their own tokens', () => {
    const s = useGameStore.getState()
    const max = DEFAULT_CONFIG.rules.maxSimultaneousAttackers
    const onP1 = ['a', 'b', 'c'].filter((id) => s.requestAttackToken(id, 'p1'))
    const onP2 = ['d', 'e', 'f'].filter((id) => s.requestAttackToken(id, 'p2'))
    expect(onP1).toHaveLength(max)
    expect(onP2).toHaveLength(max)
  })

  it('moves a waiting enemy to the queue of the player it now goes for', () => {
    const s = useGameStore.getState()
    s.requestAttackToken('a', 'p1')
    s.requestAttackToken('b', 'p1')
    expect(useGameStore.getState().attackTokens.p1.waiting).toEqual(['b'])
    expect(s.requestAttackToken('b', 'p2')).toBe(true)
    expect(useGameStore.getState().attackTokens.p1.waiting).toEqual([])
    expect(useGameStore.getState().attackTokens.p2.holders).toEqual(['b'])
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
    setP1({ lives: 1 })
    useGameStore.getState().damagePlayer(1, 150)
    expect(p1().health).toBe(0)
    expect(useGameStore.getState().isGameOver).toBe(true)
  })

  it('puts out one player without ending the game while another is still in', () => {
    useGameStore.setState((s) => ({ players: [...s.players, freshPlayer(2)] }))
    setP1({ lives: 1 })
    useGameStore.getState().damagePlayer(1, 1000)
    expect(p1().lives).toBe(0)
    expect(useGameStore.getState().isGameOver).toBe(false)
    // An out player takes no more damage or healing.
    useGameStore.getState().healPlayer(1, 10)
    expect(p1().health).toBe(0)
    const p2 = playerState(useGameStore.getState(), 2)!
    useGameStore.getState().damagePlayer(2, 10)
    expect(playerState(useGameStore.getState(), 2)!.health).toBe(p2.health - 10)
    // The last one out: game over, and a continue brings both back.
    useGameStore.setState((s) => ({ players: s.players.map((p) => (p.slot === 2 ? { ...p, lives: 1 } : p)) }))
    useGameStore.getState().damagePlayer(2, 1000)
    expect(useGameStore.getState().isGameOver).toBe(true)
    useGameStore.getState().continueGame()
    expect(useGameStore.getState().players.map((p) => p.lives)).toEqual([DEFAULT_CONFIG.rules.lives, DEFAULT_CONFIG.rules.lives])
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
    expect(p1().health).toBe(p1().maxHealth)
    expect(p1().lives).toBe(DEFAULT_CONFIG.rules.lives)
    expect(state.score).toBe(0)
    expect(state.enemies).toEqual([])
    expect(state.isGameOver).toBe(false)
    expect(state.isPaused).toBe(false)
    expect(state.attackTokens).toEqual({})
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
    after.damagePlayer(1, 10)
    after.damageEnemy('a', 100)
    after.togglePause()
    const end = useGameStore.getState()
    expect(p1().health).toBe(p1().maxHealth)
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
    s.damagePlayer(1, 1000)
    expect(p1().lives).toBe(DEFAULT_CONFIG.rules.lives - 1)
    expect(p1().health).toBe(p1().maxHealth)
    expect(p1().respawnCount).toBe(1)
    expect(useGameStore.getState().isGameOver).toBe(false)
  })

  it('is game over on the last life, then a continue restores lives in place', () => {
    for (let i = 0; i < DEFAULT_CONFIG.rules.lives; i++) useGameStore.getState().damagePlayer(1, 1000)
    expect(useGameStore.getState().isGameOver).toBe(true)
    useGameStore.setState({ score: 700 })
    useGameStore.getState().continueGame()
    const after = useGameStore.getState()
    expect(after.isGameOver).toBe(false)
    expect(p1().lives).toBe(DEFAULT_CONFIG.rules.lives)
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
    s.damagePlayer(1, 1000) // lose a life
    s.completeLevel(30)
    const before = useGameStore.getState()
    before.nextLevel()
    const after = useGameStore.getState()
    expect(after.levelIndex).toBe(1)
    expect(after.score).toBe(before.score)
    expect(after.players[0].lives).toBe(before.players[0].lives)
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
    useGameStore.setState({ score: 500 })
    setP1({ lives: 1 })
    useGameStore.getState().startRun(1)
    const s = useGameStore.getState()
    expect(s.levelIndex).toBe(1)
    expect(s.score).toBe(0)
    expect(p1().lives).toBe(DEFAULT_CONFIG.rules.lives)
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
    s.damagePlayer(1, 50)
    s.spawnPickup({ id: 'p1', pickup: 'food', x: 0, z: 0 })
    s.spawnPickup({ id: 'p1', pickup: 'food', x: 0, z: 0 })
    expect(useGameStore.getState().pickups).toHaveLength(1)
    s.collectPickup('p1', 1)
    s.collectPickup('p1', 1)
    const after = useGameStore.getState()
    expect(p1().health).toBe(p1().maxHealth - 50 + DEFAULT_CONFIG.pickups.food.amount)
    expect(after.pickups).toHaveLength(0)
  })

  it('scores coins', () => {
    const s = useGameStore.getState()
    s.spawnPickup({ id: 'c', pickup: 'coin', x: 0, z: 0 })
    s.collectPickup('c', 1)
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

describe('meter', () => {
  it('fills up to the max and is spent only when there is enough', () => {
    const s = useGameStore.getState()
    expect(p1().meter).toBe(DEFAULT_CONFIG.rules.meter.start)
    s.gainMeter(1, 30)
    expect(s.spendMeter(1, 50)).toBe(false)
    expect(p1().meter).toBe(30)
    s.gainMeter(1, 500)
    expect(p1().meter).toBe(DEFAULT_CONFIG.rules.meter.max)
    expect(s.spendMeter(1, 50)).toBe(true)
    expect(p1().meter).toBe(DEFAULT_CONFIG.rules.meter.max - 50)
    s.gainMeter(1, -20)
    expect(p1().meter).toBe(DEFAULT_CONFIG.rules.meter.max - 50)
    // Another slot's meter is its own; a missing player can't spend.
    expect(s.spendMeter(2, 1)).toBe(false)
  })
})

describe('two players', () => {
  const p2 = () => playerState(useGameStore.getState(), 2)

  it('drops player 2 in while playing, once', () => {
    useGameStore.setState({ gameScreen: 'playing' })
    expect(useGameStore.getState().joinPlayer(2, 'keyboard2')).toBe(true)
    expect(p2()).toMatchObject({ slot: 2, controls: 'keyboard2', lives: useGameStore.getState().players[0].lives })
    expect(useGameStore.getState().joinPlayer(2, 'gamepad')).toBe(false)
    // Not while paused, or at the menu.
    useGameStore.setState({ players: [freshPlayer(1)], isPaused: true })
    expect(useGameStore.getState().joinPlayer(2, 'keyboard2')).toBe(false)
    useGameStore.setState({ isPaused: false, gameScreen: 'menu' })
    expect(useGameStore.getState().joinPlayer(2, 'keyboard2')).toBe(false)
  })

  it('brings a player out of lives back on a continue, and the game goes on while one is in', () => {
    useGameStore.setState({ gameScreen: 'playing', continuesLeft: 1 })
    useGameStore.getState().joinPlayer(2, 'gamepad')
    useGameStore.setState((s) => ({ players: s.players.map((p) => (p.slot === 2 ? { ...p, lives: 1 } : p)) }))
    useGameStore.getState().damagePlayer(2, 9999)
    expect(p2()?.lives).toBe(0)
    expect(useGameStore.getState().isGameOver).toBe(false)
    expect(useGameStore.getState().joinPlayer(2, 'keyboard2')).toBe(true)
    expect(p2()).toMatchObject({ lives: freshPlayer(2).lives, controls: 'keyboard2', respawnCount: 1 })
    expect(useGameStore.getState().continuesLeft).toBe(0)
    // No continues left: can't come back.
    useGameStore.setState((s) => ({ players: s.players.map((p) => (p.slot === 2 ? { ...p, lives: 0 } : p)) }))
    expect(useGameStore.getState().joinPlayer(2, 'keyboard2')).toBe(false)
  })

  it('credits KOs and pickup score to the player who earned them', () => {
    useGameStore.setState({ gameScreen: 'playing', players: [freshPlayer(1), freshPlayer(2, 'gamepad')] })
    useGameStore.getState().spawnEnemy({ id: 'e1', type: 'BASIC', health: 5, maxHealth: 5, position: [0, 0, 0] })
    useGameStore.getState().damageEnemy('e1', 5, 2)
    const kill = DEFAULT_CONFIG.scoring.enemyKill
    expect(p2()).toMatchObject({ score: kill, kos: 1 })
    expect(playerState(useGameStore.getState(), 1)).toMatchObject({ score: 0, kos: 0 })
    expect(useGameStore.getState().score).toBe(kill)
    useGameStore.getState().addScore(50, 1)
    expect(playerState(useGameStore.getState(), 1)?.score).toBe(50)
    expect(useGameStore.getState().score).toBe(kill + 50)
  })

  it('starts the next menu run with player 1 only', () => {
    useGameStore.setState({ players: [freshPlayer(1), freshPlayer(2, 'keyboard2')] })
    useGameStore.getState().resetGame()
    expect(useGameStore.getState().players.map((p) => p.slot)).toEqual([1, 2])
    useGameStore.getState().quitRun()
    expect(useGameStore.getState().players.map((p) => p.slot)).toEqual([1])
  })
})
