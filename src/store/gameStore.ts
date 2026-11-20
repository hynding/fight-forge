import { EMPTY_POOL, cancelRequest, forget, releaseToken, requestToken, type TokenPool } from '../sim/tokens'
import { create } from 'zustand'
import type { EnemyType } from '../types/game'
import { getConfig, getLevels } from '../content/active'
import { applyPickup, type PickupInstance } from '../sim/pickups'


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
  /** Seconds of game time the level took; set when it's complete. */
  time: number | null
}

const INITIAL_LEVEL_PROGRESS: LevelProgress = {
  levelName: '',
  complete: false,
  goPrompt: false,
  waveLabel: null,
  time: null,
}

interface GameState {
  playerHealth: number
  playerMaxHealth: number
  score: number
  enemies: Enemy[]
  isGameOver: boolean
  isPaused: boolean
  gameScreen: GameScreen
  /** Who may attack the player now, and who is queued (see src/sim/tokens.ts). */
  attackTokens: TokenPool
  /** Incremented on every reset. App keys GameScene on it so a restart remounts the scene. */
  gameId: number
  levelProgress: LevelProgress
  /** Debug overlay: draw hurtboxes and active hitboxes (toggle with H). Survives restarts. */
  showHitboxes: boolean
  /** Which of the active levels (`getLevels()`) is being played. */
  levelIndex: number
  /** Lives left, including the current one. Losing the last is game over. */
  lives: number
  /** Continues left after a game over (`rules.continues` per run). */
  continuesLeft: number
  /** Incremented when the player loses a life or continues; the player respawns on change. */
  respawnCount: number
  /** Enemies defeated this level, and this run. */
  kos: number
  runKos: number
  /** Items on the ground. */
  pickups: PickupInstance[]

  // Actions
  damagePlayer: (damage: number) => void
  healPlayer: (amount: number) => void
  addScore: (points: number) => void
  spawnEnemy: (enemy: Enemy) => void
  removeEnemy: (id: string) => void
  damageEnemy: (id: string, damage: number) => void
  /** Restarts the current level with a fresh run (lives, continues, score). */
  resetGame: () => void
  /** Starts a new run at a level (from the menu); goes through the loading screen. */
  startRun: (levelIndex: number) => void
  /** After a level's results: the next level, keeping score and lives. */
  nextLevel: () => void
  /** After a game over: spend a continue to carry on where you fell, with full lives. */
  continueGame: () => void
  spawnPickup: (item: PickupInstance) => void
  collectPickup: (id: string) => void
  togglePause: () => void
  setGameScreen: (screen: GameScreen) => void
  /** Queues for a token; true if this enemy holds one now. */
  requestAttackToken: (id: string) => boolean
  cancelAttackRequest: (id: string) => void
  releaseAttackToken: (id: string) => void
  setLevelProgress: (patch: Partial<LevelProgress>) => void
  completeLevel: (time: number) => void
  toggleHitboxes: () => void
}

/** True while the game shouldn't advance: paused, game over, or level complete. */
export const isFrozen = (s: Pick<GameState, 'isPaused' | 'isGameOver' | 'levelProgress'>): boolean =>
  s.isPaused || s.isGameOver || s.levelProgress.complete

/** Everything a level starts with; the scene remounts on the new `gameId`. */
const freshLevel = (state: GameState): Partial<GameState> => ({
  enemies: [],
  pickups: [],
  attackTokens: EMPTY_POOL,
  isGameOver: false,
  isPaused: false,
  levelProgress: INITIAL_LEVEL_PROGRESS,
  kos: 0,
  gameId: state.gameId + 1,
})

/** Everything a run starts with. */
const freshRun = (): Partial<GameState> => ({
  playerHealth: getConfig().player.maxHealth,
  playerMaxHealth: getConfig().player.maxHealth,
  score: 0,
  lives: getConfig().rules.lives,
  continuesLeft: getConfig().rules.continues,
  runKos: 0,
})

export const useGameStore = create<GameState>((set, get) => ({
  playerHealth: getConfig().player.maxHealth,
  playerMaxHealth: getConfig().player.maxHealth,
  score: 0,
  enemies: [],
  isGameOver: false,
  isPaused: false,
  gameScreen: 'menu',
  attackTokens: EMPTY_POOL,
  gameId: 0,
  levelProgress: INITIAL_LEVEL_PROGRESS,
  showHitboxes: false,
  levelIndex: 0,
  lives: getConfig().rules.lives,
  continuesLeft: getConfig().rules.continues,
  respawnCount: 0,
  kos: 0,
  runKos: 0,
  pickups: [],

  toggleHitboxes: () => set((state) => ({ showHitboxes: !state.showHitboxes })),

  damagePlayer: (damage) =>
    set((state) => {
      if (state.isGameOver || state.levelProgress.complete) return {}
      const newHealth = Math.max(0, state.playerHealth - damage)
      if (newHealth > 0) return { playerHealth: newHealth }
      // Out of health: lose a life and respawn, or it's game over on the last one.
      if (state.lives > 1) {
        return {
          lives: state.lives - 1,
          playerHealth: state.playerMaxHealth,
          respawnCount: state.respawnCount + 1,
        }
      }
      return { playerHealth: 0, lives: 0, isGameOver: true }
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
      attackTokens: forget(state.attackTokens, id),
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
        score: state.score + getConfig().scoring.enemyKill,
        attackTokens: forget(state.attackTokens, id),
        kos: state.kos + 1,
        runKos: state.runKos + 1,
      }
    }),

  resetGame: () =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(),
      // Keep current screen if we're just resetting, otherwise go to playing
      gameScreen: state.gameScreen === 'menu' ? 'menu' : 'playing',
    })),

  startRun: (levelIndex) =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(),
      levelIndex: Math.max(0, Math.min(getLevels().length - 1, levelIndex)),
      gameScreen: 'loading',
    })),

  nextLevel: () =>
    set((state) =>
      state.levelProgress.complete && state.levelIndex + 1 < getLevels().length
        ? {
            ...freshLevel(state),
            levelIndex: state.levelIndex + 1,
            playerHealth: state.playerMaxHealth,
          }
        : {}
    ),

  continueGame: () =>
    set((state) =>
      state.isGameOver && state.continuesLeft > 0
        ? {
            isGameOver: false,
            continuesLeft: state.continuesLeft - 1,
            lives: getConfig().rules.lives,
            playerHealth: state.playerMaxHealth,
            respawnCount: state.respawnCount + 1,
          }
        : {}
    ),

  spawnPickup: (item) =>
    set((state) =>
      state.pickups.some((p) => p.id === item.id) ? {} : { pickups: [...state.pickups, item] }
    ),

  collectPickup: (id) =>
    set((state) => {
      const item = state.pickups.find((p) => p.id === id)
      if (!item || state.isGameOver || state.levelProgress.complete) return {}
      const def = getConfig().pickups[item.pickup]
      return {
        pickups: state.pickups.filter((p) => p.id !== id),
        ...(def ? applyPickup(state, def) : {}),
      }
    }),

  // Pausing is meaningless once the game or level is over (their overlay owns the screen).
  togglePause: () =>
    set((state) =>
      state.isGameOver || state.levelProgress.complete ? {} : { isPaused: !state.isPaused }
    ),

  setGameScreen: (screen) =>
    set({
      gameScreen: screen,
    }),

  requestAttackToken: (id) => {
    const r = requestToken(get().attackTokens, id, getConfig().enemy.maxSimultaneousAttackers)
    if (r.pool !== get().attackTokens) set({ attackTokens: r.pool })
    return r.granted
  },

  cancelAttackRequest: (id) => {
    const pool = cancelRequest(get().attackTokens, id)
    if (pool !== get().attackTokens) set({ attackTokens: pool })
  },

  releaseAttackToken: (id) => {
    const pool = releaseToken(get().attackTokens, id)
    if (pool !== get().attackTokens) set({ attackTokens: pool })
  },

  setLevelProgress: (patch) =>
    set((state) => ({ levelProgress: { ...state.levelProgress, ...patch } })),

  completeLevel: (time) =>
    set((state) =>
      state.isGameOver
        ? {}
        : {
            levelProgress: {
              ...state.levelProgress,
              complete: true,
              goPrompt: false,
              waveLabel: null,
              time,
            },
            isPaused: false,
          }
    ),
}))
