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

/** What the HUD shows about the level. Per-frame level state lives in the level runtime. */
export interface LevelProgress {
  levelName: string
  /** Set when the goal is reached; the scene freezes and shows the results overlay. */
  complete: boolean
  /** "GO →" after a screen lock is released. */
  goPrompt: boolean
  /** e.g. "Wave 2/3" during a fight, null otherwise. */
  waveLabel: string | null
}

const INITIAL_LEVEL_PROGRESS: LevelProgress = {
  levelName: '',
  complete: false,
  goPrompt: false,
  waveLabel: null,
}

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
  levelProgress: LevelProgress
  /** Debug overlay: draw hurtboxes and active hitboxes (toggle with H). Survives restarts. */
  showHitboxes: boolean

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
  setLevelProgress: (patch: Partial<LevelProgress>) => void
  completeLevel: () => void
  toggleHitboxes: () => void
}

/** True while the game shouldn't advance: paused, game over, or level complete. */
export const isFrozen = (s: Pick<GameState, 'isPaused' | 'isGameOver' | 'levelProgress'>): boolean =>
  s.isPaused || s.isGameOver || s.levelProgress.complete

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
  levelProgress: INITIAL_LEVEL_PROGRESS,
  showHitboxes: false,

  toggleHitboxes: () => set((state) => ({ showHitboxes: !state.showHitboxes })),

  damagePlayer: (damage) =>
    set((state) => {
      if (state.isGameOver || state.levelProgress.complete) return {}
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
      if (state.isGameOver || state.levelProgress.complete) return {}
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
      levelProgress: INITIAL_LEVEL_PROGRESS,
      // Keep current screen if we're just resetting, otherwise go to playing
      gameScreen: state.gameScreen === 'menu' ? 'menu' : 'playing',
    })),

  // Pausing is meaningless once the game or level is over (their overlay owns the screen).
  togglePause: () =>
    set((state) =>
      state.isGameOver || state.levelProgress.complete ? {} : { isPaused: !state.isPaused }
    ),

  setGameScreen: (screen) =>
    set({
      gameScreen: screen,
    }),

  setAttackingEnemy: (id) =>
    set({
      attackingEnemyId: id,
    }),

  setLevelProgress: (patch) =>
    set((state) => ({ levelProgress: { ...state.levelProgress, ...patch } })),

  completeLevel: () =>
    set((state) =>
      state.isGameOver
        ? {}
        : {
            levelProgress: { ...state.levelProgress, complete: true, goPrompt: false, waveLabel: null },
            isPaused: false,
          }
    ),
}))
