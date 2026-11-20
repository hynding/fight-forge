import type { ClipMap } from '../sim/animation'
import type { MoveSet } from '../sim/moves'
import type { ReactionConfig } from '../sim/reactions'
import type { ActionsConfig } from '../sim/defense'
import type { AiBehavior } from '../sim/controllers'
import { DEFAULT_CONTENT } from '../content/defaultContent'
import type { DropDef, PickupDef } from '../sim/pickups'

/**
 * Every gameplay tuning value in one typed object. The values come from
 * content packs (`content/default/*.json` is the default pack), validated by
 * the schemas in `src/content/schemas.ts`, which mirror these types.
 *
 * Units: distances in world units, speeds in units/s, times in seconds of game
 * time (see `gameStep`), unless the field name says otherwise.
 */

export type Vec3 = [number, number, number]

/**
 * How a fighter looks. `offset` and `scale` are multiplied by the fighter's
 * own scale. Either way, gameplay (collider, hit ranges) never depends on it.
 */
export type ModelRef =
  /** The built-in box humanoid; also the fallback when a glTF is missing or fails. */
  | { kind: 'procedural'; offset: Vec3 }
  | {
      kind: 'gltf'
      /** URL of a .glb/.gltf (files in `public/` are served from the site root). */
      url: string
      scale: number
      offset: Vec3
      /** Radians; turns the model to face -Z (glTF models usually face +Z). */
      rotationY: number
      /** Material names recolored with the fighter's color. */
      tintMaterials: string[]
      /** Fighter state to animation clip. */
      clips: ClipMap
    }

export interface EnemyTypeDef {
  maxHealth: number
  /** Uniform scale for the model and collider. */
  scale: number
  /** Chase speed. Patrol and circling are fractions of this. */
  speed: number
  /** Multiplies `enemy.aggroRange`. */
  aggression: number
  /** Which AI archetype drives it (an id in `ai`). */
  ai: string
  /** The move it throws when it gets an attack token; defaults to `enemy.attackMove`. */
  attackMove?: string
  /** Super armor: hits with at most this much hitstun (and no knockdown) don't stagger it. */
  armor?: number
  /** What it may drop when defeated. */
  drop?: DropDef
  color: string
  model: ModelRef
  /** Collider half extents before `scale`; defaults to `body.colliderHalfExtents`. */
  colliderHalfExtents?: Vec3
}

export interface GameConfig {
  physics: {
    gravity: Vec3
  }
  /** Shared by player and enemies, multiplied by each fighter's scale. */
  body: {
    /** Default collider half extents, before each fighter's scale. */
    colliderHalfExtents: Vec3
    /** Grounded = something solid within this distance below the body centre (half-height 1 + slack), × scale. */
    groundRayLength: number
    /** ...and vertical speed below this. */
    groundedMaxVelY: number
    /** Below this speed an axis counts as stopped (walk animation off; player deceleration snaps to 0). */
    stopSpeed: number
  }
  player: {
    maxHealth: number
    color: string
    model: ModelRef
    colliderHalfExtents?: Vec3
    spawnPosition: Vec3
    walkSpeed: number
    jumpVelocity: number
    /** Velocity multiplier per 60 Hz frame while no direction is held. */
    deceleration: number
    linearDamping: number
    /** First move of the light-attack combo (J); the rest chain through each move's `next`. */
    lightAttack: string
    /** J in the air (once per jump). */
    jumpAttack: string
    /** J while running (double-tap a direction). */
    dashAttack: string
  }
  enemy: {
    /** Base aggro radius, multiplied by the type's aggression. */
    aggroRange: number
    /** Enemies attack only when this close to the player in depth (Z); reach in X comes from the AI archetype. */
    depthTolerance: number
    /** How many enemies may attack the player at once (attack tokens). */
    maxSimultaneousAttackers: number
    /** The default move an enemy throws when it gets an attack token (one per hold). */
    attackMove: string
    /** How long an enemy holds its attack token. */
    attackSlotDuration: number
    /** Wait after releasing the token before asking again. */
    attackSlotRecovery: number
    /** Velocity multiplier per 60 Hz step when not moving; 0 stops instantly. */
    deceleration: number
    minSpacing: number
    /** Spacing push strength above which an enemy counts as crowded. */
    crowdedThreshold: number
    /** Weight of the spacing push vs. the chase direction when crowded (they sum to 1). */
    avoidanceWeight: number
    /** Circling speed as a fraction of `speed` while waiting for the attack slot. */
    circleSpeedFactor: number
    linearDamping: number
    patrol: {
      retargetInterval: number
      minDistance: number
      maxDistance: number
      speedFactor: number
      arriveDistance: number
    }
  }
  /** Enemy types by id. */
  enemyTypes: Record<string, EnemyTypeDef>
  /** AI archetypes: each is a small strategy picked by enemy definitions. */
  ai: Record<string, AiBehavior>
  /** Every move by name; times in seconds, hitboxes before the attacker's scale. */
  moves: MoveSet
  reactions: ReactionConfig
  /** Running, blocking and dodging. */
  actions: ActionsConfig
  spawning: {
    /** Enemies that walk in appear this far beyond the left or right screen edge. */
    offscreenMargin: number
    /** Drop height for spawned enemies. */
    height: number
  }
  camera: {
    /** Height above the ground and distance in front of the depth lane's centre (z = 0). */
    height: number
    distance: number
    /** The camera looks at (screen centre, lookAtHeight, lookAtDepth); behind the lane puts the lane low on screen. */
    lookAtHeight: number
    lookAtDepth: number
    /** Vertical field of view in degrees. */
    fov: number
    /** The player can move this far either side of the screen centre before the camera follows. */
    deadZone: number
    /** Classic beat 'em up: once scrolled forward, the camera never scrolls back. */
    allowBacktrack: boolean
    /** Fighters stay this far inside the left and right screen edges. */
    edgeMargin: number
  }
  /** The level's length comes from its segments (see src/sim/level.ts). */
  stage: {
    /** Depth lane: fighters move within z in [min, max]. */
    depthBand: [number, number]
    floorThickness: number
    wallHeight: number
    wallThickness: number
  }
  scoring: {
    enemyKill: number
  }
  /** Game flow rules. */
  rules: {
    lives: number
    /** Continues per run after a game over. */
    continues: number
    /** Seconds of invulnerability after respawning. */
    respawnInvulnerability: number
    /** The player collects a pickup within this planar distance. */
    pickupRadius: number
  }
  /** Items by name, placed by levels or dropped by enemies. */
  pickups: Record<string, PickupDef>
}

/** The box humanoid: its feet sit 0.65 below its origin, so drop it 0.35 onto the collider bottom. */
export const PROCEDURAL_MODEL: ModelRef = { kind: 'procedural', offset: [0, -0.35, 0] }

/**
 * The default pack's config (from `content/default/*.json`), for tests and
 * tools. Gameplay code reads the active content with `getConfig()` from
 * `src/content/active.ts` instead, so a loaded pack takes effect.
 */
export const DEFAULT_CONFIG: GameConfig = DEFAULT_CONTENT.config
