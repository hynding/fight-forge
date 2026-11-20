import { create } from 'zustand'
import { EnemyType } from '../types/game'
import { DEFAULT_CONFIG } from '../config/defaults'

export const ENEMY_KILL_SCORE = DEFAULT_CONFIG.scoring.enemyKill

export interface Enemy {
  id: string
  type: EnemyType
  health: number
  maxHealth: number
  position: [number, number, number]
}

type GameScreen = 'menu' | 'loading' | 'playing'

interface GameState {
  playerHealth: number
  playerMaxHealth: number
  score: number
  enemies: Enemy[]
  isGameOver: boolean
  isPaused: boolean
  gameScreen: GameScreen
  attackingEnemyId: string | null
  /** Incremented on every reset. App keys GameScene on it so a restart remounts the scene. */
  gameId: number

  // Actions
  damagePlayer: (damage: number) => void
  healPlayer: (amount: number) => void
  addScore: (points: number) => void
  spawnEnemy: (enemy: Enemy) => void
  removeEnemy: (id: string) => void
  damageEnemy: (id: string, damage: number) => void
  resetGame: () => void
  togglePause: () => void
  setGameScreen: (screen: GameScreen) => void
  setAttackingEnemy: (id: string | null) => void
}

export const useGameStore = create<GameState>((set) => ({
  playerHealth: DEFAULT_CONFIG.player.maxHealth,
  playerMaxHealth: DEFAULT_CONFIG.player.maxHealth,
  score: 0,
  enemies: [],
  isGameOver: false,
  isPaused: false,
  gameScreen: 'menu',
  attackingEnemyId: null,
  gameId: 0,

  damagePlayer: (damage) =>
    set((state) => {
      if (state.isGameOver) return {}
      const newHealth = Math.max(0, state.playerHealth - damage)
      return {
        playerHealth: newHealth,
        isGameOver: newHealth === 0,
      }
    }),

  healPlayer: (amount) =>
    set((state) => ({
      playerHealth: Math.min(state.playerMaxHealth, state.playerHealth + amount),
    })),

  addScore: (points) =>
    set((state) => ({
      score: state.score + points,
    })),

  spawnEnemy: (enemy) =>
    set((state) => ({
      enemies: [...state.enemies, enemy],
    })),

  removeEnemy: (id) =>
    set((state) => ({
      enemies: state.enemies.filter((e) => e.id !== id),
      // Clear attacking enemy if it's the one being removed
      attackingEnemyId: state.attackingEnemyId === id ? null : state.attackingEnemyId,
    })),

  // Applies damage and, when health reaches 0, removes the enemy and awards the
  // kill score in the same update, so a kill can never be scored twice and a
  // dead enemy never lingers for a frame.
  damageEnemy: (id, damage) =>
    set((state) => {
      if (state.isGameOver) return {}
      const target = state.enemies.find((e) => e.id === id)
      if (!target) return {}

      const health = Math.max(0, target.health - damage)
      if (health > 0) {
        return {
          enemies: state.enemies.map((e) => (e.id === id ? { ...e, health } : e)),
        }
      }

      return {
        enemies: state.enemies.filter((e) => e.id !== id),
        score: state.score + ENEMY_KILL_SCORE,
        attackingEnemyId: state.attackingEnemyId === id ? null : state.attackingEnemyId,
      }
    }),

  resetGame: () =>
    set((state) => ({
      playerHealth: state.playerMaxHealth,
      score: 0,
      enemies: [],
      isGameOver: false,
      isPaused: false,
      attackingEnemyId: null,
      gameId: state.gameId + 1,
      // Keep current screen if we're just resetting, otherwise go to playing
      gameScreen: state.gameScreen === 'menu' ? 'menu' : 'playing',
    })),

  // Pausing is meaningless once the game is over (the game-over overlay owns the screen).
  togglePause: () =>
    set((state) => (state.isGameOver ? {} : { isPaused: !state.isPaused })),

  setGameScreen: (screen) =>
    set({
      gameScreen: screen,
    }),

  setAttackingEnemy: (id) =>
    set({
      attackingEnemyId: id,
    }),
}))
