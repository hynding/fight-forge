import { useRef, useEffect, forwardRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { HumanoidModel } from './HumanoidModel'

// Module-scoped temp vectors — reused every frame to avoid allocations.
// Safe because Enemy.useFrame is single-threaded per renderer.
const _enemyVec = new Vector3()
const _toOther = new Vector3()
const _direction = new Vector3()
const _avoidanceForce = new Vector3()
const _moveDirection = new Vector3()
const _toPlayer = new Vector3()
const _circleDir = new Vector3()
const _otherPos = new Vector3()
const _patrolDelta = new Vector3()

interface EnemyProps {
  id: string
  type: EnemyType
  position: [number, number, number]
  playerPositionRef: RefObject<Vector3>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}

export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs }, ref) => {
    const rigidBodyRef = useRef<RapierRigidBody>(null)
    const enemyRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
    const visualGroupRef = useRef<Group>(null)
    const facingDirection = useRef(new Vector3(0, 0, -1))
    const patrolTarget = useRef<Vector3 | null>(null)
    const patrolTimer = useRef(0)
    const personalityTimer = useRef(Math.random() * 1000)
    const animationTimeRef = useRef(0)
    const isMovingRef = useRef(false)

    const removeEnemy = useGameStore((state) => state.removeEnemy)
    const addScore = useGameStore((state) => state.addScore)
    const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
    const setAttackingEnemy = useGameStore((state) => state.setAttackingEnemy)

    const aggressionLevel = useRef(
      type === EnemyType.FAST ? 1.2 : type === EnemyType.HEAVY ? 0.8 : 1.0
    )

    const health = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.health ?? 50
    })
    const maxHealth = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.maxHealth ?? 50
    })

    const isAttacking = attackingEnemyId === id

    const AGGRO_RANGE = 10 * aggressionLevel.current
    const ATTACK_RANGE = 1.5
    const SPEED = type === EnemyType.FAST ? 3 : type === EnemyType.HEAVY ? 1.5 : 2
    const MIN_ENEMY_SPACING = 2.5

    useEffect(() => {
      if (health <= 0) {
        removeEnemy(id)
        addScore(100)
      }
    }, [health, id, removeEnemy, addScore])

    useFrame((_, delta) => {
      if (!enemyRef.current || !playerPositionRef.current) return

      animationTimeRef.current += delta

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distanceToPlayer = _enemyVec.distanceTo(playerPositionRef.current)

      const vel = enemyRef.current.linvel()
      isMovingRef.current = Math.abs(vel.x) > 0.1 || Math.abs(vel.z) > 0.1

      personalityTimer.current += delta * 1000

      // Avoidance against other enemies — read positions directly from refs.
      _avoidanceForce.set(0, 0, 0)
      enemyRefs.forEach((otherRef, otherId) => {
        if (otherId === id || !otherRef.current) return
        const op = otherRef.current.translation()
        _otherPos.set(op.x, op.y, op.z)
        _toOther.subVectors(_enemyVec, _otherPos)
        const distToOther = _toOther.length()
        if (distToOther < MIN_ENEMY_SPACING && distToOther > 0) {
          _toOther
            .normalize()
            .multiplyScalar((MIN_ENEMY_SPACING - distToOther) / MIN_ENEMY_SPACING)
          _avoidanceForce.add(_toOther)
        }
      })

      if (distanceToPlayer < AGGRO_RANGE) {
        _direction.subVectors(playerPositionRef.current, _enemyVec).normalize()
        facingDirection.current.copy(_direction)

        const hasAvoidance = _avoidanceForce.length() > 0.1

        if (distanceToPlayer > ATTACK_RANGE) {
          _moveDirection.copy(_direction)

          if (hasAvoidance) {
            _avoidanceForce.normalize().multiplyScalar(0.7)
            _moveDirection.multiplyScalar(0.3)
            _moveDirection.add(_avoidanceForce).normalize()
          }

          enemyRef.current.setLinvel(
            {
              x: _moveDirection.x * SPEED,
              y: enemyRef.current.linvel().y,
              z: _moveDirection.z * SPEED,
            },
            true
          )
        } else {
          const shouldHold =
            hasAvoidance && attackingEnemyId !== null && attackingEnemyId !== id

          if (shouldHold) {
            _circleDir.set(-_direction.z, 0, _direction.x)
            enemyRef.current.setLinvel(
              {
                x: _circleDir.x * SPEED * 0.5,
                y: enemyRef.current.linvel().y,
                z: _circleDir.z * SPEED * 0.5,
              },
              true
            )
          } else {
            enemyRef.current.setLinvel(
              { x: 0, y: enemyRef.current.linvel().y, z: 0 },
              true
            )

            if (!isAttacking && attackingEnemyId === null) {
              _toPlayer.subVectors(playerPositionRef.current, _enemyVec).normalize()
              const dotProduct = facingDirection.current.dot(_toPlayer)

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
        // Patrol behavior
        patrolTimer.current += delta * 1000

        if (!patrolTarget.current || patrolTimer.current > 3000) {
          const angle = Math.random() * Math.PI * 2
          const distance = 3 + Math.random() * 5
          patrolTarget.current = new Vector3(
            enemyPos.x + Math.cos(angle) * distance,
            enemyPos.y,
            enemyPos.z + Math.sin(angle) * distance
          )
          patrolTimer.current = 0
        }

        _patrolDelta.subVectors(patrolTarget.current, _enemyVec)
        const distToPatrol = _patrolDelta.length()

        if (distToPatrol > 0.5) {
          _patrolDelta.normalize()
          facingDirection.current.copy(_patrolDelta)

          enemyRef.current.setLinvel(
            {
              x: _patrolDelta.x * SPEED * 0.3,
              y: enemyRef.current.linvel().y,
              z: _patrolDelta.z * SPEED * 0.3,
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

      // Drive rotation imperatively from facing direction
      if (visualGroupRef.current) {
        visualGroupRef.current.rotation.y = Math.atan2(
          -facingDirection.current.x,
          -facingDirection.current.z
        )
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

    const scale = getScale()

    return (
      <RigidBody
        ref={enemyRef}
        colliders={false}
        position={position}
        enabledRotations={[false, false, false]}
        linearDamping={2}
      >
        <CuboidCollider args={[0.25 * scale, 1 * scale, 0.25 * scale]} />

        <group ref={visualGroupRef}>
          <HumanoidModel
            color={isAttacking ? '#ffffff' : getColor()}
            emissive={isAttacking ? '#ff0000' : '#000000'}
            emissiveIntensity={isAttacking ? 0.5 : 0}
            scale={scale}
            animationTimeRef={animationTimeRef}
            isMovingRef={isMovingRef}
          />

          {isAttacking && (
            <mesh position={[0, 0, -0.5 * scale]}>
              <boxGeometry args={[1.5 * scale, 1.5 * scale, 1 * scale]} />
              <meshBasicMaterial
                color="#ff0000"
                transparent
                opacity={0.3}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Health bar background */}
          <mesh position={[0, 1.5 * scale, 0]} renderOrder={1000}>
            <boxGeometry args={[1.2, 0.15, 0.02]} />
            <meshBasicMaterial color="#333333" depthTest={false} />
          </mesh>

          {/* Health bar fill */}
          <mesh
            position={[-(1.2 * (1 - health / maxHealth)) / 2, 1.5 * scale, 0.01]}
            renderOrder={1001}
          >
            <boxGeometry args={[1.2 * (health / maxHealth), 0.15, 0.02]} />
            <meshBasicMaterial
              color={
                health / maxHealth > 0.5
                  ? '#00ff00'
                  : health / maxHealth > 0.25
                    ? '#ffff00'
                    : '#ff0000'
              }
              depthTest={false}
            />
          </mesh>

          {/* Health bar border */}
          <mesh position={[0, 1.5 * scale, 0.02]} renderOrder={1002}>
            <boxGeometry args={[1.24, 0.19, 0.01]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
          </mesh>
        </group>
      </RigidBody>
    )
  }
)
