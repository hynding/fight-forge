import type { InputDevice, PadLabelSet } from '../sim/input'
import { NO_POOLS, cancelRequests, forgetAll, releaseTokens, requestTokenFor, type TokenPools } from '../sim/tokens'
import { create } from 'zustand'
import type { EnemyType } from '../types/game'
import { getConfig, getLevels } from '../content/active'
import { applyPickup, type PickupInstance } from '../sim/pickups'
import type { PropInstance } from '../sim/props'
import type { HeldWeapon } from '../sim/weapons'
import type { Level } from '../sim/level'


export interface Enemy {
  id: string
  type: EnemyType
  health: number
  maxHealth: number
  position: [number, number, number]
}

/** One player's state: health, lives, meter and the weapon in hand (for the HUD). */
export interface PlayerState {
  /** 1 for player 1 (`p1` in the scene), 2 for player 2. */
  slot: number
  health: number
  maxHealth: number
  /** Lives left, including the current one. Losing the last puts the player out. */
  lives: number
  /** The special meter (see `rules.meter`); kept between levels of a run. */
  meter: number
  /** Incremented when the player loses a life or continues; the player respawns on change. */
  respawnCount: number
  /** The weapon in the player's hands, for the HUD (the player's runtime is the truth). */
  weapon: HeldWeapon | null
}

/** A player as a run starts them. */
export const freshPlayer = (slot: number): PlayerState => {
  const config = getConfig()
  return {
    slot,
    health: config.player.maxHealth,
    maxHealth: config.player.maxHealth,
    lives: config.rules.lives,
    meter: config.rules.meter.start,
    respawnCount: 0,
    weapon: null,
  }
}

/** A player's state by slot, if that player is in the game. */
export const playerState = (s: Pick<GameState, 'players'>, slot: number): PlayerState | undefined => s.players.find((p) => p.slot === slot)

/** The players with `slot` changed by `f` (others unchanged). */
const withPlayer = (players: PlayerState[], slot: number, f: (p: PlayerState) => Partial<PlayerState> | null): PlayerState[] =>
  players.map((p) => {
    if (p.slot !== slot) return p
    const patch = f(p)
    return patch ? { ...p, ...patch } : p
  })

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
  /** The boss fight under way: the HUD's boss bar (health is read from `enemies`). */
  boss: BossProgress | null
  /** The boss's name card is showing: the fight is frozen until it goes. */
  bossIntro: boolean
  /** Seconds the last boss fight took, for the results. */
  bossTime: number | null
}

export interface BossProgress {
  /** Enemy id of the boss. */
  id: string
  title: string
  subtitle?: string
  /** Phase thresholds (fractions of max health), for the bar's ticks. */
  thresholds: number[]
  /** Game time the fight started. */
  startedAt: number
}

const INITIAL_LEVEL_PROGRESS: LevelProgress = {
  levelName: '',
  complete: false,
  goPrompt: false,
  waveLabel: null,
  time: null,
  boss: null,
  bossIntro: false,
  bossTime: null,
}

interface GameState {
  /** Who's playing, by slot (player 1 first). */
  players: PlayerState[]
  score: number
  enemies: Enemy[]
  isGameOver: boolean
  isPaused: boolean
  gameScreen: GameScreen
  /** Who may attack each player now, and who is queued, by player id (see src/sim/tokens.ts). */
  attackTokens: TokenPools
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
  /** A sandbox boss starts with this fraction of its health (the Forge's "from phase N"). */
  sandboxBossHealth: number
  /** A sandbox player starts holding this weapon (the Forge's "Fight with it"). */
  sandboxWeapon: string | null
  /** Where a sandbox came from in the Forge, so editing mid-fight can come back to it. */
  playtest: PlaytestOrigin | null
  /** The Forge is open over a paused sandbox (the scene stays mounted underneath). */
  editing: boolean
  /** Continues left after a game over (`rules.continues` per run). */
  continuesLeft: number
  /** Enemies defeated this level, and this run. */
  kos: number
  runKos: number
  /** Items on the ground. */
  pickups: PickupInstance[]
  /** Props standing on the stage (broken or lifted ones are removed). */
  props: PropInstance[]
  /** Imported content packs, in load order after the default pack (see src/content/library.ts). */
  packs: PackSummary[]
  /** Why the chosen packs can't be played together, if they can't; the menu won't start a run meanwhile. */
  contentError: string | null

  // Actions
  /** Damage to a player: at 0 health they lose a life; losing the last puts them out, and with every player out it's game over. */
  damagePlayer: (slot: number, damage: number) => void
  /** Pay health for a move: never below 1, and never a lost life. */
  spendHealth: (slot: number, amount: number) => void
  /** Fill a player's special meter (up to `rules.meter.max`). */
  gainMeter: (slot: number, amount: number) => void
  /** Spend meter on a move; false (and nothing spent) without enough. */
  spendMeter: (slot: number, amount: number) => boolean
  healPlayer: (slot: number, amount: number) => void
  addScore: (points: number) => void
  spawnEnemy: (enemy: Enemy) => void
  removeEnemy: (id: string) => void
  damageEnemy: (id: string, damage: number) => void
  /** Restarts the current level with a fresh run (lives, continues, score). */
  resetGame: () => void
  /** Starts a new run at a level (from the menu); goes through the loading screen. */
  startRun: (levelIndex: number) => void
  /** Starts a Forge sandbox fight in a generated level (through the loading screen). */
  startSandbox: (level: Level, origin?: PlaytestOrigin, opts?: { bossHealth?: number; weapon?: string }) => void
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
  /** Player `slot` collects a pickup (a heal heals that player). */
  collectPickup: (id: string, slot: number) => void
  /** Places a level's props (ids are stable, so placing twice changes nothing). */
  placeProps: (props: PropInstance[]) => void
  /** Damages a breakable prop; true if that broke it (it's removed). */
  damageProp: (id: string, damage: number) => boolean
  /** Takes a prop off the stage (lifted). */
  removeProp: (id: string) => void
  setPlayerWeapon: (slot: number, weapon: HeldWeapon | null) => void
  togglePause: () => void
  setGameScreen: (screen: GameScreen) => void
  /** Queues for a token against player `target`; true if this enemy holds one now. */
  requestAttackToken: (id: string, target: string) => boolean
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

/** True while the game shouldn't advance: paused, editing in the Forge, game over, level complete, or a boss's name card. */
export const isFrozen = (s: Pick<GameState, 'isPaused' | 'isGameOver' | 'levelProgress'> & { editing?: boolean }): boolean =>
  s.isPaused || !!s.editing || s.isGameOver || s.levelProgress.complete || s.levelProgress.bossIntro

/** Everything a level starts with; the scene remounts on the new `gameId`. */
const freshLevel = (state: GameState): Partial<GameState> => ({
  enemies: [],
  pickups: [],
  props: [],
  players: state.players.map((p) => (p.weapon ? { ...p, weapon: null } : p)),
  attackTokens: NO_POOLS,
  isGameOver: false,
  isPaused: false,
  levelProgress: INITIAL_LEVEL_PROGRESS,
  kos: 0,
  gameId: state.gameId + 1,
})

/** Everything a run starts with. */
const freshRun = (state: GameState): Partial<GameState> => ({
  players: state.players.map((p) => freshPlayer(p.slot)),
  score: 0,
  continuesLeft: getConfig().rules.continues,
  runKos: 0,
})

export const useGameStore = create<GameState>((set, get) => ({
  players: [freshPlayer(1)],
  score: 0,
  enemies: [],
  isGameOver: false,
  isPaused: false,
  gameScreen: 'menu',
  attackTokens: NO_POOLS,
  gameId: 0,
  levelProgress: INITIAL_LEVEL_PROGRESS,
  showHitboxes: false,
  inputDevice: 'keyboard',
  padLabels: null,
  packs: [],
  contentError: null,
  levelIndex: 0,
  sandbox: null,
  sandboxBossHealth: 1,
  sandboxWeapon: null,
  playtest: null,
  editing: false,
  continuesLeft: getConfig().rules.continues,
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

  spendHealth: (slot, amount) =>
    set((s) => ({ players: withPlayer(s.players, slot, (p) => ({ health: Math.max(1, p.health - amount) })) })),
  gainMeter: (slot, amount) => {
    const max = getConfig().rules.meter.max
    const s = get()
    const p = playerState(s, slot)
    if (!p) return
    const next = Math.min(max, p.meter + Math.max(0, amount))
    if (next !== p.meter) set({ players: withPlayer(s.players, slot, () => ({ meter: next })) })
  },
  spendMeter: (slot, amount) => {
    const s = get()
    const p = playerState(s, slot)
    if (!p || p.meter + 1e-9 < amount) return false
    set({ players: withPlayer(s.players, slot, () => ({ meter: Math.max(0, p.meter - amount) })) })
    return true
  },
  damagePlayer: (slot, damage) =>
    set((state) => {
      if (state.isGameOver || state.levelProgress.complete) return {}
      const players = withPlayer(state.players, slot, (p) => {
        if (p.lives <= 0) return null
        const health = Math.max(0, p.health - damage)
        if (health > 0) return { health }
        // Out of health: lose a life and respawn, or the player is out on the last one.
        if (p.lives > 1) return { lives: p.lives - 1, health: p.maxHealth, respawnCount: p.respawnCount + 1 }
        return { health: 0, lives: 0 }
      })
      // Every player out: game over.
      return players.every((p) => p.lives <= 0) ? { players, isGameOver: true } : { players }
    }),

  healPlayer: (slot, amount) =>
    set((state) => ({
      players: withPlayer(state.players, slot, (p) => (p.lives > 0 ? { health: Math.min(p.maxHealth, p.health + amount) } : null)),
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
      attackTokens: forgetAll(state.attackTokens, id),
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
        attackTokens: forgetAll(state.attackTokens, id),
        kos: state.kos + 1,
        runKos: state.runKos + 1,
      }
    }),

  resetGame: () =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(state),
      // Keep a menu screen; restarting from the game goes back to playing.
      gameScreen: state.gameScreen === 'menu' || state.gameScreen === 'forge' || state.gameScreen === 'gallery' ? state.gameScreen : 'playing',
      editing: false,
    })),

  startRun: (levelIndex) =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(state),
      levelIndex: Math.max(0, Math.min(getLevels().length - 1, levelIndex)),
      sandbox: null,
      playtest: null,
      editing: false,
      gameScreen: 'loading',
    })),

  startSandbox: (level, origin, opts) =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(state),
      levelIndex: 0,
      sandbox: level,
      sandboxBossHealth: opts?.bossHealth ?? 1,
      sandboxWeapon: opts?.weapon ?? null,
      playtest: origin ?? null,
      editing: false,
      gameScreen: 'loading',
    })),

  editPlaytest: () => set((state) => (state.sandbox && state.gameScreen === 'playing' ? { editing: true, isPaused: false } : {})),

  resumePlaytest: () => set({ editing: false }),

  quitRun: () =>
    set((state) => ({
      ...freshLevel(state),
      ...freshRun(state),
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
            players: state.players.map((p) => ({ ...p, health: p.maxHealth, weapon: null })),
          }
        : {}
    ),

  continueGame: () =>
    set((state) =>
      state.isGameOver && state.continuesLeft > 0
        ? {
            isGameOver: false,
            continuesLeft: state.continuesLeft - 1,
            // Everyone who was out comes back with full lives.
            players: state.players.map((p) =>
              p.lives > 0 ? p : { ...p, lives: getConfig().rules.lives, health: p.maxHealth, respawnCount: p.respawnCount + 1 }
            ),
          }
        : {}
    ),

  spawnPickup: (item) =>
    set((state) =>
      state.pickups.some((p) => p.id === item.id) ? {} : { pickups: [...state.pickups, item] }
    ),

  collectPickup: (id, slot) =>
    set((state) => {
      const item = state.pickups.find((p) => p.id === id)
      const player = playerState(state, slot)
      if (!item || !player || state.isGameOver || state.levelProgress.complete) return {}
      const def = getConfig().pickups[item.pickup]
      const got = def ? applyPickup({ health: player.health, maxHealth: player.maxHealth, score: state.score }, def) : {}
      return {
        pickups: state.pickups.filter((p) => p.id !== id),
        ...(got.score !== undefined ? { score: got.score } : {}),
        ...(got.health !== undefined ? { players: withPlayer(state.players, slot, () => ({ health: got.health })) } : {}),
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

  removeProp: (id) => set((state) => ({ props: state.props.filter((p) => p.id !== id) })),

  setPlayerWeapon: (slot, weapon) =>
    set((state) => ({ players: withPlayer(state.players, slot, () => ({ weapon: weapon ? { ...weapon } : null })) })),

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

  requestAttackToken: (id, target) => {
    const r = requestTokenFor(get().attackTokens, target, id, getConfig().rules.maxSimultaneousAttackers)
    if (r.pools !== get().attackTokens) set({ attackTokens: r.pools })
    return r.granted
  },

  cancelAttackRequest: (id) => {
    const pools = cancelRequests(get().attackTokens, id)
    if (pools !== get().attackTokens) set({ attackTokens: pools })
  },

  releaseAttackToken: (id) => {
    const pools = releaseTokens(get().attackTokens, id)
    if (pools !== get().attackTokens) set({ attackTokens: pools })
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
