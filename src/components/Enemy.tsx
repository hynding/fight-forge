import { useRef, useEffect, forwardRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Vector3, Euler } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { HumanoidModel } from './HumanoidModel'

interface EnemyProps {
  id: string
  type: EnemyType
  position: [number, number, number]
  playerPosition?: Vector3
  otherEnemyPositions?: Array<{ id: string; position: Vector3 }>
}

export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(({ id, type, position, playerPosition, otherEnemyPositions = [] }, ref) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const enemyRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
  const facingDirection = useRef(new Vector3(0, 0, -1))
  const patrolTarget = useRef<Vector3 | null>(null)
  const patrolTimer = useRef(0)
  const personalityTimer = useRef(Math.random() * 1000) // Random offset for behavior
  const animationTime = useRef(0)
  const isMoving = useRef(false)
  // const [isMoving, setIsMoving] = useState(false)
  const removeEnemy = useGameStore((state) => state.removeEnemy)
  const addScore = useGameStore((state) => state.addScore)
  const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
  const setAttackingEnemy = useGameStore((state) => state.setAttackingEnemy)

  // AI personality - some enemies are more cautious, others aggressive
  const aggressionLevel = useRef(type === EnemyType.FAST ? 1.2 : type === EnemyType.HEAVY ? 0.8 : 1.0)

  // Get health from the store
  const health = useGameStore((state) => {
    const enemy = state.enemies.find((e) => e.id === id)
    return enemy?.health ?? 50
  })
  const maxHealth = useGameStore((state) => {
    const enemy = state.enemies.find((e) => e.id === id)
    return enemy?.maxHealth ?? 50
  })

  // This enemy is attacking if it's the current attacking enemy
  const isAttacking = attackingEnemyId === id

  const AGGRO_RANGE = 10 * aggressionLevel.current
  const ATTACK_RANGE = 1.5
  const SPEED = type === EnemyType.FAST ? 3 : type === EnemyType.HEAVY ? 1.5 : 2
  const MIN_ENEMY_SPACING = 2.5 // Minimum distance from other enemies

  useEffect(() => {
    if (health <= 0) {
      removeEnemy(id)
      addScore(100)
    }
  }, [health, id, removeEnemy, addScore])

  useFrame((_, delta) => {
    if (!enemyRef.current || !playerPosition) return

    animationTime.current += delta

    const enemyPos = enemyRef.current.translation()
    const enemyVec = new Vector3(enemyPos.x, enemyPos.y, enemyPos.z)
    const distanceToPlayer = enemyVec.distanceTo(playerPosition)

    // Track velocity for animation
    const vel = enemyRef.current.linvel()
    const isCurrentlyMoving = Math.abs(vel.x) > 0.1 || Math.abs(vel.z) > 0.1
    isMoving.current = isCurrentlyMoving
    // setIsMoving(isCurrentlyMoving)

    personalityTimer.current += delta * 1000

    // Calculate avoidance from other enemies
    const avoidanceForce = new Vector3()
    otherEnemyPositions.forEach(({ id: otherId, position: otherPos }) => {
      if (otherId === id) return
      const toOther = new Vector3().subVectors(enemyVec, otherPos)
      const distToOther = toOther.length()

      if (distToOther < MIN_ENEMY_SPACING && distToOther > 0) {
        // Push away from nearby enemies
        toOther.normalize().multiplyScalar((MIN_ENEMY_SPACING - distToOther) / MIN_ENEMY_SPACING)
        avoidanceForce.add(toOther)
      }
    })

    if (distanceToPlayer < AGGRO_RANGE) {
      const direction = new Vector3()
        .subVectors(playerPosition, enemyVec)
        .normalize()

      // Update facing direction
      facingDirection.current.copy(direction)

      // Check if too close to other enemies - circle around if so
      const hasAvoidance = avoidanceForce.length() > 0.1

      if (distanceToPlayer > ATTACK_RANGE) {
        // Move towards player with avoidance
        let moveDirection = direction.clone()

        if (hasAvoidance) {
          // Blend attack and avoidance - circle around
          avoidanceForce.normalize().multiplyScalar(0.7)
          moveDirection.multiplyScalar(0.3)
          moveDirection.add(avoidanceForce).normalize()
        }

        enemyRef.current.setLinvel(
          {
            x: moveDirection.x * SPEED,
            y: enemyRef.current.linvel().y,
            z: moveDirection.z * SPEED,
          },
          true
        )
      } else {
        // At attack range - stop moving if others are too close (wait your turn)
        const shouldHold = hasAvoidance && attackingEnemyId !== null && attackingEnemyId !== id

        if (shouldHold) {
          // Circle around waiting
          const circleDir = new Vector3(-direction.z, 0, direction.x)
          enemyRef.current.setLinvel(
            {
              x: circleDir.x * SPEED * 0.5,
              y: enemyRef.current.linvel().y,
              z: circleDir.z * SPEED * 0.5,
            },
            true
          )
        } else {
          // Stop and try to attack
          enemyRef.current.setLinvel(
            { x: 0, y: enemyRef.current.linvel().y, z: 0 },
            true
          )

          // Attack player - only if no other enemy is attacking AND facing the player
          if (!isAttacking && attackingEnemyId === null) {
            const toPlayer = new Vector3().subVectors(playerPosition, enemyVec).normalize()
            const dotProduct = facingDirection.current.dot(toPlayer)

            if (dotProduct > 0.5) {
              setAttackingEnemy(id)
              setTimeout(() => {
                setAttackingEnemy(null)
              }, 1000)
            }
          }
        }
      }
    } else {
      // Out of aggro range - patrol behavior
      patrolTimer.current += delta * 1000

      if (!patrolTarget.current || patrolTimer.current > 3000) {
        // Pick a new patrol point every 3 seconds
        const angle = Math.random() * Math.PI * 2
        const distance = 3 + Math.random() * 5
        patrolTarget.current = new Vector3(
          enemyPos.x + Math.cos(angle) * distance,
          enemyPos.y,
          enemyPos.z + Math.sin(angle) * distance
        )
        patrolTimer.current = 0
      }

      const toPatrol = new Vector3().subVectors(patrolTarget.current, enemyVec)
      const distToPatrol = toPatrol.length()

      if (distToPatrol > 0.5) {
        toPatrol.normalize()
        facingDirection.current.copy(toPatrol)

        enemyRef.current.setLinvel(
          {
            x: toPatrol.x * SPEED * 0.3,
            y: enemyRef.current.linvel().y,
            z: toPatrol.z * SPEED * 0.3,
          },
          true
        )
      } else {
        enemyRef.current.setLinvel(
          { x: 0, y: enemyRef.current.linvel().y, z: 0 },
          true
        )
      }
    }
  })

  const getColor = () => {
    switch (type) {
      case EnemyType.FAST:
        return '#ffff00'
      case EnemyType.HEAVY:
        return '#ff0000'
      default:
        return '#00ff00'
    }
  }

  const getScale = (): number => {
    switch (type) {
      case EnemyType.HEAVY:
        return 1.3
      case EnemyType.FAST:
        return 0.8
      default:
        return 1
    }
  }

  // Calculate rotation based on facing direction
  // atan2 gives angle from -Z axis (forward), rotate to face movement direction
  const rotation = new Euler(
    0,
    Math.atan2(-facingDirection.current.x, -facingDirection.current.z),
    0
  )

  return (
    <RigidBody
      ref={enemyRef}
      colliders={false}
      position={position}
      enabledRotations={[false, false, false]}
      linearDamping={2}
    >
      <CuboidCollider args={[0.25 * getScale(), 1 * getScale(), 0.25 * getScale()]} />

      {/* Enemy humanoid model */}
      <group rotation={rotation}>
        <HumanoidModel
          color={isAttacking ? '#ffffff' : getColor()}
          emissive={isAttacking ? '#ff0000' : '#000000'}
          emissiveIntensity={isAttacking ? 0.5 : 0}
          scale={getScale()}
          animationTime={animationTime.current}
          isMoving={isMoving.current}
        />

        {/* Attack hitbox indicator - only visible during attack */}
        {isAttacking && (
          <mesh position={[0, 0, -0.5 * getScale()]}>
            <boxGeometry args={[1.5 * getScale(), 1.5 * getScale(), 1 * getScale()]} />
            <meshBasicMaterial
              color="#ff0000"
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Health bar background (always visible) */}
        <mesh position={[0, 1.5 * getScale(), 0]} renderOrder={1000}>
          <boxGeometry args={[1.2, 0.15, 0.02]} />
          <meshBasicMaterial color="#333333" depthTest={false} />
        </mesh>

        {/* Health bar fill (green portion) */}
        <mesh
          position={[-(1.2 * (1 - health / maxHealth)) / 2, 1.5 * getScale(), 0.01]}
          renderOrder={1001}
        >
          <boxGeometry args={[1.2 * (health / maxHealth), 0.15, 0.02]} />
          <meshBasicMaterial
            color={health / maxHealth > 0.5 ? '#00ff00' : health / maxHealth > 0.25 ? '#ffff00' : '#ff0000'}
            depthTest={false}
          />
        </mesh>

        {/* Health bar border */}
        <mesh position={[0, 1.5 * getScale(), 0.02]} renderOrder={1002}>
          <boxGeometry args={[1.24, 0.19, 0.01]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
        </mesh>
      </group>
    </RigidBody>
  )
})
