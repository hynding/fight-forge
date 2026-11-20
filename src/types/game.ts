import { Vector3 } from 'three'

export interface CharacterState {
  health: number
  maxHealth: number
  position: Vector3
  velocity: Vector3
  isAttacking: boolean
  isBlocking: boolean
  isDead: boolean
  comboCount: number
  lastAttackTime: number
}

export interface AttackData {
  damage: number
  knockback: number
  range: number
  duration: number
}

/** An enemy type's id in the content (`enemyTypes`), e.g. `BASIC`. */
export type EnemyType = string

export interface EnemyState extends CharacterState {
  type: EnemyType
  aggroRange: number
  attackCooldown: number
}
