import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'

const _playerVec = new Vector3()
const _enemyVec = new Vector3()
const _toEnemy = new Vector3()

const ATTACK_RANGE = 3
const ATTACK_CONE = 0.5
const ENEMY_HIT_RANGE = 2
const ENEMY_DAMAGE = 10
const ENEMY_DAMAGE_COOLDOWN = 1 // seconds of game time

interface CombatSystemProps {
  playerRef: React.RefObject<RapierRigidBody>
  playerAttacking: boolean
  attackDirectionRef: RefObject<Vector3>
  enemyRefs: Map<string, React.RefObject<RapierRigidBody>>
  playerPositionRef: RefObject<Vector3>
}

export const CombatSystem = ({
  playerRef,
  playerAttacking,
  attackDirectionRef,
  enemyRefs,
  playerPositionRef,
}: CombatSystemProps) => {
  const damagePlayer = useGameStore((state) => state.damagePlayer)
  const damageEnemy = useGameStore((state) => state.damageEnemy)
  const lastEnemyDamageTime = useRef<Map<string, number>>(new Map())
  const gameTime = useRef(0)
  const damagedEnemiesThisAttack = useRef<Set<string>>(new Set())
  const lastAttackState = useRef(false)

  useFrame((_, delta) => {
    if (!playerRef.current) return

    const playerPos = playerRef.current.translation()
    _playerVec.set(playerPos.x, playerPos.y, playerPos.z)

    // Mutate the shared player-position ref so camera + enemies read the latest value.
    if (playerPositionRef.current) {
      playerPositionRef.current.copy(_playerVec)
    }

    // Read live store state; a render-time snapshot can lag the store by frames.
    const { isPaused, isGameOver, attackingEnemyId } = useGameStore.getState()
    if (isPaused || isGameOver) return

    // Game-time clock (seconds of unpaused frames), so the per-enemy damage
    // cooldown freezes with the enemy's attack-slot timer during a pause.
    gameTime.current += gameStep(delta)
    const now = gameTime.current

    if (!playerAttacking && lastAttackState.current) {
      damagedEnemiesThisAttack.current.clear()
    }
    lastAttackState.current = playerAttacking

    // Forget cooldowns for enemies that no longer exist.
    lastEnemyDamageTime.current.forEach((_, enemyId) => {
      if (!enemyRefs.has(enemyId)) lastEnemyDamageTime.current.delete(enemyId)
    })

    enemyRefs.forEach((enemyRef, enemyId) => {
      if (!enemyRef.current) return

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distance = _playerVec.distanceTo(_enemyVec)

      const lastDmg = lastEnemyDamageTime.current.get(enemyId) ?? -Infinity
      if (
        attackingEnemyId === enemyId &&
        distance < ENEMY_HIT_RANGE &&
        now - lastDmg > ENEMY_DAMAGE_COOLDOWN
      ) {
        damagePlayer(ENEMY_DAMAGE)
        lastEnemyDamageTime.current.set(enemyId, now)
      }

      if (playerAttacking && !damagedEnemiesThisAttack.current.has(enemyId)) {
        _toEnemy.subVectors(_enemyVec, _playerVec).normalize()
        const dotProduct = attackDirectionRef.current?.dot(_toEnemy) ?? 0

        if (distance < ATTACK_RANGE && dotProduct > ATTACK_CONE) {
          damageEnemy(enemyId, 20)
          damagedEnemiesThisAttack.current.add(enemyId)
        }
      }
    })
  })

  return null
}
