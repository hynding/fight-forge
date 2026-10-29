import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'

const _playerVec = new Vector3()
const _enemyVec = new Vector3()
const _toEnemy = new Vector3()

const ATTACK_RANGE = 3
const ATTACK_CONE = 0.5

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
  const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
  const lastEnemyDamageTime = useRef<Map<string, number>>(new Map())
  const damagedEnemiesThisAttack = useRef<Set<string>>(new Set())
  const lastAttackState = useRef(false)

  useFrame(() => {
    if (!playerRef.current) return

    const playerPos = playerRef.current.translation()
    _playerVec.set(playerPos.x, playerPos.y, playerPos.z)

    // Mutate the shared player-position ref so camera + enemies read the latest value.
    if (playerPositionRef.current) {
      playerPositionRef.current.copy(_playerVec)
    }

    const now = Date.now()

    if (!playerAttacking && lastAttackState.current) {
      damagedEnemiesThisAttack.current.clear()
    }
    lastAttackState.current = playerAttacking

    enemyRefs.forEach((enemyRef, enemyId) => {
      if (!enemyRef.current) return

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distance = _playerVec.distanceTo(_enemyVec)

      const lastDmg = lastEnemyDamageTime.current.get(enemyId) || 0
      if (attackingEnemyId === enemyId && distance < 2 && now - lastDmg > 1000) {
        damagePlayer(10)
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
