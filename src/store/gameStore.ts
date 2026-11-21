import type { InputDevice, PadLabelSet } from '../sim/input'
import { EMPTY_POOL, cancelRequest, forget, releaseToken, requestToken, type TokenPool } from '../sim/tokens'
import { create } from 'zustand'
import type { EnemyType } from '../types/game'
import { getConfig, getLevels } from '../content/active'
import { applyPickup, type PickupInstance } from '../sim/pickups'
import type { PropInstance } from '../sim/props'
import type { Level } from '../sim/level'


export interface Enemy {
  id: string
  type: EnemyType
  health: number
  maxHealth: number
  position: [number, number, number]
}

type GameScreen = 'menu' | 'loading' | 'playing' | 'forge' | 'gallery'

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
  /** The device last used, so on-screen prompts name its buttons. */
  inputDevice: InputDevice
  /** The controller's button names, once one has pressed something (null before). */
  padLabels: PadLabelSet | null
  /** Which of the active levels (`getLevels()`) is being played. */
  levelIndex: number
  /** A Forge sandbox fight, played instead of the active levels; leaving it returns to the Forge. */
  sandbox: Level | null
  /** Where a sandbox came from in the Forge, so editing mid-fight can come back to it. */
  playtest: PlaytestOrigin | null
  /** The Forge is open over a paused sandbox (the scene stays mounted underneath). */
  editing: boolean
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
  /** Props standing on the stage (broken ones are removed). */
  props: PropInstance[]
  /** Imported content packs, in load order after the default pack (see src/content/library.ts). */
  packs: PackSummary[]
  /** Why the chosen packs can't be played together, if they can't; the menu won't start a run meanwhile. */
  contentError: string | null

  // Actions
  damagePlayer: (damage: number) => void
  /** Pay health for a move: never below 1, and never a lost life. */
  spendHealth: (amount: number) => void
  healPlayer: (amount: number) => void
  addScore: (points: number) => void
  spawnEnemy: (enemy: Enemy) => void
  removeEnemy: (id: string) => void
  damageEnemy: (id: string, damage: number) => void
  /** Restarts the current level with a fresh run (lives, continues, score). */
  resetGame: () => void
  /** Starts a new run at a level (from the menu); goes through the loading screen. */
  startRun: (levelIndex: number) => void
  /** Starts a Forge sandbox fight in a generated level (through the loading screen). */
  startSandbox: (level: Level, origin?: PlaytestOrigin) => void
  /** Mid-sandbox: open the Forge over the paused fight. */
  editPlaytest: () => void
  /** Close the Forge and carry on with the paused fight. */
  resumePlaytest: () => void
  /** Leaves the run: back to the menu, or to the Forge from a sandbox. */
  quitRun: () => void
  /** After a level's results: the next level, keeping score and lives. */
  nextLevel: () => void
  /** After a game over: spend a continue to carry on where you fell, with full lives. */
  continueGame: () => void
  spawnPickup: (item: PickupInstance) => void
  collectPickup: (id: string) => void
  /** Places a level's props (ids are stable, so placing twice changes nothing). */
  placeProps: (props: PropInstance[]) => void
  /** Damages a breakable prop; true if that broke it (it's removed). */
  damageProp: (id: string, damage: number) => boolean
  togglePause: () => void
  setGameScreen: (screen: GameScreen) => void
  /** Queues for a token; true if this enemy holds one now. */
  requestAttackToken: (id: string) => boolean
  cancelAttackRequest: (id: string) => void
  releaseAttackToken: (id: string) => void
  setLevelProgress: (patch: Partial<LevelProgress>) => void
  completeLevel: (time: number) => void
  toggleHitboxes: () => void
  /** The device last used (and a controller's label set). Only updates when it changes. */
  setInputDevice: (device: InputDevice, padLabels?: PadLabelSet) => void
  /** Called by the pack library after installing, toggling or removing packs. */
  setPacks: (packs: PackSummary[], contentError: string | null) => void
}

/** What the menu shows about an imported pack. */
export interface PackSummary {
  id: string
  name: string
  version: string
  author: string
  description: string
  /** A URL of the pack's cover image, if it has one. */
  cover?: string
  enabled: boolean
}

/**
 * Where a Forge sandbox came from: the workspace pack, and for a level
 * playtest the level as it was played and how much of its start was cut off
 * (`levelFrom`), so a stage position maps back to the level.
 */
export interface PlaytestOrigin {
  packId: string
  level?: { id: string; def: Level; cut: number }
}

/** True while the game shouldn't advance: paused, editing in the Forge, game over, or level complete. */
export const isFrozen = (s: Pick<GameState, 'isPaused' | 'isGameOver' | 'levelProgress'> & { editing?: boolean }): boolean =>
  s.isPaused || !!s.editing || s.isGameOver || s.levelProgress.complete

/** Everything a level starts with; the scene remounts on the new `gameId`. */
const freshLevel = (state: GameState): Partial<GameState> => ({
  enemies: [],
  pickups: [],
  props: [],
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
  inputDevice: 'keyboard',
  padLabels: null,
  packs: [],
  contentError: null,
  levelIndex: 0,
  sandbox: null,
  playtest: null,
  editing: false,
  lives: getConfig().rules.lives,
  continuesLeft: getConfig().rules.continues,
  respawnCount: 0,
  kos: 0,
  runKos: 0,
  pickups: [],
  props: [],

  toggleHitboxes: () => set((state) => ({ showHitboxes: !state.showHitboxes })),
  setInputDevice: (device, padLabels) => {
    const s = get()
    const labels = padLabels ?? s.padLabels
    if (s.inputDevice !== device || s.padLabels !== labels) set({ inputDevice: device, padLabels: labels })
  },
  setPacks: (packs, contentError) => set({ packs, contentError }),

  spendHealth: (amount) => set((s) => ({ playerHealth: Math.max(1, s.playerHealth - amount) })),
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
      // Keep a menu screen; restarting from the game goes back to playing.
      gameScreen: state.gameScreen === 'menu' || state.gameScreen === 'forge' || state.gameScreen === 'gallery' ? state.gameScreen : 'playing',
      editing: false,
    })),

  startRun: (levelIndex) =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(),
      levelIndex: Math.max(0, Math.min(getLevels().length - 1, levelIndex)),
      sandbox: null,
      playtest: null,
      editing: false,
      gameScreen: 'loading',
    })),

  startSandbox: (level, origin) =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(),
      levelIndex: 0,
      sandbox: level,
      playtest: origin ?? null,
      editing: false,
      gameScreen: 'loading',
    })),

  editPlaytest: () => set((state) => (state.sandbox && state.gameScreen === 'playing' ? { editing: true, isPaused: false } : {})),

  resumePlaytest: () => set({ editing: false }),

  quitRun: () =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(),
      gameScreen: state.sandbox ? 'forge' : 'menu',
      sandbox: null,
      playtest: null,
      editing: false,
    })),

  nextLevel: () =>
    set((state) =>
      state.levelProgress.complete && !state.sandbox && state.levelIndex + 1 < getLevels().length
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

  placeProps: (props) =>
    set((state) => {
      const fresh = props.filter((p) => !state.props.some((q) => q.id === p.id))
      return fresh.length ? { props: [...state.props, ...fresh] } : {}
    }),

  damageProp: (id, damage) => {
    const prop = get().props.find((p) => p.id === id)
    if (!prop || !Number.isFinite(prop.health) || damage <= 0) return false
    const health = prop.health - damage
    set((state) => ({
      props: health <= 0 ? state.props.filter((p) => p.id !== id) : state.props.map((p) => (p.id === id ? { ...p, health } : p)),
    }))
    return health <= 0
  },

  // Pausing is meaningless once the game or level is over (their overlay owns the screen).
  togglePause: () =>
    set((state) =>
      state.isGameOver || state.levelProgress.complete ? {} : { isPaused: !state.isPaused }
    ),

  setGameScreen: (screen) =>
    set({
      gameScreen: screen,
      editing: false,
    }),

  requestAttackToken: (id) => {
    const r = requestToken(get().attackTokens, id, getConfig().rules.maxSimultaneousAttackers)
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
