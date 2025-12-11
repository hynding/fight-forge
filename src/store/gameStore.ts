import { create } from 'zustand'
import { EnemyType } from '../types/game'

interface Enemy {
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
  playerHealth: 100,
  playerMaxHealth: 100,
  score: 0,
  enemies: [],
  isGameOver: false,
  isPaused: false,
  gameScreen: 'menu',
  attackingEnemyId: null,

  damagePlayer: (damage) =>
    set((state) => {
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

  damageEnemy: (id, damage) =>
    set((state) => ({
      enemies: state.enemies.map((enemy) =>
        enemy.id === id
          ? { ...enemy, health: Math.max(0, enemy.health - damage) }
          : enemy
      ),
    })),

  resetGame: () =>
    set((state) => ({
      playerHealth: 100,
      score: 0,
      enemies: [],
      isGameOver: false,
      isPaused: false,
      attackingEnemyId: null,
      // Keep current screen if we're just resetting, otherwise go to playing
      gameScreen: state.gameScreen === 'menu' ? 'menu' : 'playing',
    })),

  togglePause: () =>
    set((state) => ({
      isPaused: !state.isPaused,
    })),

  setGameScreen: (screen) =>
    set({
      gameScreen: screen,
    }),

  setAttackingEnemy: (id) =>
    set({
      attackingEnemyId: id,
    }),
}))
