import { EnemyType } from '../types/game'

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

export interface EnemyTypeDef {
  maxHealth: number
  /** Uniform scale for the model and collider. */
  scale: number
  /** Chase speed. Patrol and circling are fractions of this. */
  speed: number
  /** Multiplies `enemy.aggroRange`. */
  aggression: number
  color: string
}

export interface GameConfig {
  physics: {
    gravity: Vec3
  }
  /** Shared by player and enemies, multiplied by each fighter's scale. */
  body: {
    colliderHalfExtents: Vec3
    /** HumanoidModel's feet sit 0.65 below its origin; this drops them onto the collider bottom. */
    modelYOffset: number
    /** Below this speed an axis counts as stopped (walk animation off; player deceleration snaps to 0). */
    stopSpeed: number
  }
  player: {
    maxHealth: number
    color: string
    spawnPosition: Vec3
    walkSpeed: number
    jumpVelocity: number
    /** Velocity multiplier per 60 Hz frame while no direction is held. */
    deceleration: number
    /** Grounded = something solid within this distance below the body centre (half-height 1 + slack). */
    groundRayLength: number
    groundedMaxVelY: number
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
    /** Within this distance an enemy stops chasing and tries to attack. */
    attackRange: number
    /** Within this distance an attacking enemy's hit lands. */
    hitRange: number
    damage: number
    /** Minimum game time between two hits from the same enemy. */
    damageCooldown: number
    /** How long an enemy holds the single attacker slot. */
    attackSlotDuration: number
    /** Wait after releasing the slot before claiming it again. */
    attackSlotRecovery: number
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
    initialType: EnemyType
    initialPositions: Vec3[]
    /** Game time between periodic spawns. */
    interval: number
    maxEnemies: number
    /** Periodic spawns appear on a circle of this radius around the arena centre. */
    distance: number
    height: number
    types: EnemyType[]
  }
  camera: {
    /** Camera position relative to the player while playing. */
    followOffset: Vec3
    initialPosition: Vec3
    minDistance: number
    maxDistance: number
    maxPolarAngle: number
  }
  arena: {
    size: number
    floorThickness: number
    wallHeight: number
    wallThickness: number
  }
  scoring: {
    enemyKill: number
  }
}

export const DEFAULT_CONFIG: GameConfig = {
  physics: {
    gravity: [0, -20, 0],
  },
  body: {
    colliderHalfExtents: [0.25, 1, 0.25],
    modelYOffset: -0.35,
    stopSpeed: 0.1,
  },
  player: {
    maxHealth: 100,
    color: '#4444ff',
    spawnPosition: [0, 2, 0],
    walkSpeed: 5,
    jumpVelocity: 8,
    deceleration: 0.85,
    groundRayLength: 1.1,
    groundedMaxVelY: 0.5,
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
    hitRange: 2,
    damage: 10,
    damageCooldown: 1,
    attackSlotDuration: 1,
    attackSlotRecovery: 1,
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
    [EnemyType.BASIC]: { maxHealth: 50, scale: 1, speed: 2, aggression: 1, color: '#00ff00' },
    [EnemyType.FAST]: { maxHealth: 30, scale: 0.8, speed: 3, aggression: 1.2, color: '#ffff00' },
    [EnemyType.HEAVY]: { maxHealth: 100, scale: 1.3, speed: 1.5, aggression: 0.8, color: '#ff0000' },
  },
  spawning: {
    initialType: EnemyType.BASIC,
    initialPositions: [
      [5, 2, 5],
      [-5, 2, 5],
      [5, 2, -5],
      [-5, 2, -5],
    ],
    interval: 5,
    maxEnemies: 8,
    distance: 10,
    height: 2,
    types: [EnemyType.BASIC, EnemyType.FAST, EnemyType.HEAVY],
  },
  camera: {
    followOffset: [0, 15, 20],
    initialPosition: [0, 17, 20],
    minDistance: 10,
    maxDistance: 30,
    maxPolarAngle: Math.PI / 2.2,
  },
  arena: {
    size: 30,
    floorThickness: 0.5,
    wallHeight: 4,
    wallThickness: 0.5,
  },
  scoring: {
    enemyKill: 100,
  },
}
