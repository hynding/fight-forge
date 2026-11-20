import { EnemyType } from '../types/game'
import type { ClipMap } from '../sim/animation'

/**
 * Every gameplay tuning value in one typed object.
 *
 * Components read from `DEFAULT_CONFIG` instead of declaring their own literals,
 * so later milestones can turn this into the default content pack (JSON validated
 * by a schema) without hunting constants across the codebase.
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
    attack: {
      duration: number
      cooldown: number
      range: number
      /** Minimum dot(facing, toEnemy) for a hit. */
      cone: number
      damage: number
    }
  }
  enemy: {
    /** Base aggro radius, multiplied by the type's aggression. */
    aggroRange: number
    /** Within this X distance (and `depthTolerance` in Z) an enemy stops chasing and tries to attack. */
    attackRange: number
    depthTolerance: number
    /** Within this distance an attacking enemy's hit lands. */
    hitRange: number
    damage: number
    /** Minimum game time between two hits from the same enemy. */
    damageCooldown: number
    /** How long an enemy holds the single attacker slot. */
    attackSlotDuration: number
    /** Wait after releasing the slot before claiming it again. */
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
  enemyTypes: Record<EnemyType, EnemyTypeDef>
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
}

/** The box humanoid: its feet sit 0.65 below its origin, so drop it 0.35 onto the collider bottom. */
export const PROCEDURAL_MODEL: ModelRef = { kind: 'procedural', offset: [0, -0.35, 0] }

const ROBOT_URL = '/models/robot-expressive.glb'
// RobotExpressive is 4.46 units tall with its feet at y=0 and faces +Z.
const robotModel = (attackSpeed: number): ModelRef => ({
  kind: 'gltf',
  url: ROBOT_URL,
  scale: 0.4,
  offset: [0, -1, 0],
  rotationY: Math.PI,
  tintMaterials: ['Main'],
  clips: {
    idle: 'Idle',
    walk: 'Walking',
    jump: 'Jump',
    attack: { name: 'Punch', speed: attackSpeed },
    dead: 'Death',
  },
})
// The punch clip is 0.83s: the player's 0.2s swing plays it fast, an enemy's
// 1s hold on the attack slot plays it at normal speed.
const PLAYER_MODEL = robotModel(3.5)
const ENEMY_MODEL = robotModel(1)

export const DEFAULT_CONFIG: GameConfig = {
  physics: {
    gravity: [0, -20, 0],
  },
  body: {
    colliderHalfExtents: [0.25, 1, 0.25],
    groundRayLength: 1.1,
    groundedMaxVelY: 0.5,
    stopSpeed: 0.1,
  },
  player: {
    maxHealth: 100,
    color: '#4444ff',
    model: PLAYER_MODEL,
    spawnPosition: [3, 2, 0],
    walkSpeed: 5,
    jumpVelocity: 8,
    deceleration: 0.85,
    linearDamping: 0,
    attack: {
      duration: 0.2,
      cooldown: 0.5,
      range: 3,
      cone: 0.5,
      damage: 20,
    },
  },
  enemy: {
    aggroRange: 10,
    attackRange: 1.5,
    depthTolerance: 0.5,
    hitRange: 2,
    damage: 10,
    damageCooldown: 1,
    attackSlotDuration: 1,
    attackSlotRecovery: 1,
    deceleration: 0,
    minSpacing: 2.5,
    crowdedThreshold: 0.1,
    avoidanceWeight: 0.7,
    circleSpeedFactor: 0.5,
    linearDamping: 2,
    patrol: {
      retargetInterval: 3,
      minDistance: 3,
      maxDistance: 8,
      speedFactor: 0.3,
      arriveDistance: 0.5,
    },
  },
  enemyTypes: {
    [EnemyType.BASIC]: { maxHealth: 50, scale: 1, speed: 2, aggression: 1, color: '#00ff00', model: ENEMY_MODEL },
    [EnemyType.FAST]: { maxHealth: 30, scale: 0.8, speed: 3, aggression: 1.2, color: '#ffff00', model: ENEMY_MODEL },
    [EnemyType.HEAVY]: { maxHealth: 100, scale: 1.3, speed: 1.5, aggression: 0.8, color: '#ff0000', model: ENEMY_MODEL },
  },
  spawning: {
    offscreenMargin: 2,
    height: 2,
  },
  camera: {
    height: 6,
    distance: 12,
    lookAtHeight: 2.5,
    lookAtDepth: -3,
    fov: 50,
    deadZone: 2,
    allowBacktrack: false,
    edgeMargin: 0.75,
  },
  stage: {
    depthBand: [-3, 3],
    floorThickness: 0.5,
    wallHeight: 4,
    wallThickness: 0.5,
  },
  scoring: {
    enemyKill: 100,
  },
}
