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

export enum EnemyType {
  BASIC = 'BASIC',
  HEAVY = 'HEAVY',
  FAST = 'FAST'
}

export interface EnemyState extends CharacterState {
  type: EnemyType
  aggroRange: number
  attackCooldown: number
}
