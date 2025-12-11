import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'

interface CombatSystemProps {
  playerRef: React.RefObject<RapierRigidBody>
  playerAttacking: boolean
  attackDirection: Vector3
  enemyRefs: Map<string, React.RefObject<RapierRigidBody>>
  onPlayerPositionUpdate: (position: Vector3) => void
}

export const CombatSystem = ({ playerRef, playerAttacking, attackDirection, enemyRefs, onPlayerPositionUpdate }: CombatSystemProps) => {
  const damagePlayer = useGameStore((state) => state.damagePlayer)
  const damageEnemy = useGameStore((state) => state.damageEnemy)
  const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
  const lastEnemyDamageTime = useRef<Map<string, number>>(new Map())
  const damagedEnemiesThisAttack = useRef<Set<string>>(new Set())
  const lastAttackState = useRef(false)

  useFrame(() => {
    if (!playerRef.current) return

    const playerPos = playerRef.current.translation()
    const playerVec = new Vector3(playerPos.x, playerPos.y, playerPos.z)

    // Update player position for enemies
    onPlayerPositionUpdate(playerVec)

    const now = Date.now()

    // Reset damaged enemies when attack ends
    if (!playerAttacking && lastAttackState.current) {
      damagedEnemiesThisAttack.current.clear()
    }
    lastAttackState.current = playerAttacking

    // Check collision with each enemy
    enemyRefs.forEach((enemyRef, enemyId) => {
      if (!enemyRef.current) return

      const enemyPos = enemyRef.current.translation()
      const enemyVec = new Vector3(enemyPos.x, enemyPos.y, enemyPos.z)
      const distance = playerVec.distanceTo(enemyVec)

      // Enemy damages player - ONLY if this enemy is the one attacking
      const lastDmg = lastEnemyDamageTime.current.get(enemyId) || 0
      if (attackingEnemyId === enemyId && distance < 2 && now - lastDmg > 1000) {
        damagePlayer(10)
        lastEnemyDamageTime.current.set(enemyId, now)
      }

      // Player attacks enemy - directional check
      if (playerAttacking && !damagedEnemiesThisAttack.current.has(enemyId)) {
        const toEnemy = new Vector3().subVectors(enemyVec, playerVec).normalize()
        const dotProduct = attackDirection.dot(toEnemy)

        // Check if enemy is within cone (60 degrees = 0.5 dot product) and range
        const ATTACK_RANGE = 3
        const ATTACK_CONE = 0.5

        if (distance < ATTACK_RANGE && dotProduct > ATTACK_CONE) {
          damageEnemy(enemyId, 20)
          damagedEnemiesThisAttack.current.add(enemyId)
        }
      }
    })
  })

  return null
}
