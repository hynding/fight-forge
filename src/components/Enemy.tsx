import { useRef, forwardRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Billboard } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { HumanoidModel } from './HumanoidModel'
import { gameStep } from '../utils/gameTime'
import { DEFAULT_CONFIG } from '../config/defaults'

// Module-scoped temp vectors — reused every frame to avoid allocations.
// Safe because Enemy.useFrame is single-threaded per renderer.
const _enemyVec = new Vector3()
const _toOther = new Vector3()
const _direction = new Vector3()
const _avoidanceForce = new Vector3()
const _moveDirection = new Vector3()
const _circleDir = new Vector3()
const _otherPos = new Vector3()
const _patrolDelta = new Vector3()

const E = DEFAULT_CONFIG.enemy
const BODY = DEFAULT_CONFIG.body

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
    const personalityTimer = useRef(Math.random())
    const animationTimeRef = useRef(0)
    const isMovingRef = useRef(false)
    // Game-time (seconds) countdowns; they only advance on unpaused frames.
    const attackTimeLeft = useRef(0)
    const attackRecoveryLeft = useRef(0)

    const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
    const setAttackingEnemy = useGameStore((state) => state.setAttackingEnemy)

    const def = DEFAULT_CONFIG.enemyTypes[type]

    const health = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.health ?? def.maxHealth
    })
    const maxHealth = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.maxHealth ?? def.maxHealth
    })

    const isAttacking = attackingEnemyId === id

    const scale = def.scale
    const speed = def.speed
    const aggroRange = E.aggroRange * def.aggression
    const modelYOffset = BODY.modelYOffset * scale

    // Death (removal + score) is handled atomically by `damageEnemy` in the store.

    useFrame((_, frameDelta) => {
      if (!enemyRef.current || !playerPositionRef.current) return
      // Read live store state: the render-time `attackingEnemyId` can be several
      // frames stale, which let multiple enemies claim the attacker slot at once.
      const { isPaused, isGameOver, attackingEnemyId: currentAttackerId } =
        useGameStore.getState()
      if (isPaused || isGameOver) return
      const delta = gameStep(frameDelta)

      animationTimeRef.current += delta

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distanceToPlayer = _enemyVec.distanceTo(playerPositionRef.current)

      const vel = enemyRef.current.linvel()
      isMovingRef.current =
        Math.abs(vel.x) > BODY.stopSpeed ||
        Math.abs(vel.z) > BODY.stopSpeed

      personalityTimer.current += delta

      // Attack slot bookkeeping. Removal on death/unmount is handled by the store.
      attackRecoveryLeft.current = Math.max(0, attackRecoveryLeft.current - delta)
      if (attackTimeLeft.current > 0) {
        attackTimeLeft.current -= delta
        if (attackTimeLeft.current <= 0) {
          attackTimeLeft.current = 0
          // Back off before trying again so other enemies get a turn.
          attackRecoveryLeft.current = E.attackSlotRecovery
          // Only release the slot if we still hold it.
          if (currentAttackerId === id) setAttackingEnemy(null)
        }
      }

      // Avoidance against other enemies — read positions directly from refs.
      _avoidanceForce.set(0, 0, 0)
      enemyRefs.forEach((otherRef, otherId) => {
        if (otherId === id || !otherRef.current) return
        const op = otherRef.current.translation()
        _otherPos.set(op.x, op.y, op.z)
        _toOther.subVectors(_enemyVec, _otherPos)
        const distToOther = _toOther.length()
        if (distToOther < E.minSpacing && distToOther > 0) {
          _toOther
            .normalize()
            .multiplyScalar((E.minSpacing - distToOther) / E.minSpacing)
          _avoidanceForce.add(_toOther)
        }
      })

      if (distanceToPlayer < aggroRange) {
        _direction.subVectors(playerPositionRef.current, _enemyVec).normalize()
        facingDirection.current.copy(_direction)

        const hasAvoidance = _avoidanceForce.length() > E.crowdedThreshold

        if (distanceToPlayer > E.attackRange) {
          _moveDirection.copy(_direction)

          if (hasAvoidance) {
            _avoidanceForce.normalize().multiplyScalar(E.avoidanceWeight)
            _moveDirection.multiplyScalar(1 - E.avoidanceWeight)
            _moveDirection.add(_avoidanceForce).normalize()
          }

          enemyRef.current.setLinvel(
            {
              x: _moveDirection.x * speed,
              y: enemyRef.current.linvel().y,
              z: _moveDirection.z * speed,
            },
            true
          )
        } else {
          const shouldHold =
            hasAvoidance && currentAttackerId !== null && currentAttackerId !== id

          if (shouldHold) {
            _circleDir.set(-_direction.z, 0, _direction.x)
            enemyRef.current.setLinvel(
              {
                x: _circleDir.x * speed * E.circleSpeedFactor,
                y: enemyRef.current.linvel().y,
                z: _circleDir.z * speed * E.circleSpeedFactor,
              },
              true
            )
          } else {
            enemyRef.current.setLinvel(
              { x: 0, y: enemyRef.current.linvel().y, z: 0 },
              true
            )

            if (currentAttackerId === null && attackRecoveryLeft.current === 0) {
              setAttackingEnemy(id)
              attackTimeLeft.current = E.attackSlotDuration
            }
          }
        }
      } else {
        // Patrol behavior
        patrolTimer.current += delta

        if (!patrolTarget.current || patrolTimer.current > E.patrol.retargetInterval) {
          const angle = Math.random() * Math.PI * 2
          const distance =
            E.patrol.minDistance +
            Math.random() * (E.patrol.maxDistance - E.patrol.minDistance)
          patrolTarget.current = new Vector3(
            enemyPos.x + Math.cos(angle) * distance,
            enemyPos.y,
            enemyPos.z + Math.sin(angle) * distance
          )
          patrolTimer.current = 0
        }

        _patrolDelta.subVectors(patrolTarget.current, _enemyVec)
        const distToPatrol = _patrolDelta.length()

        if (distToPatrol > E.patrol.arriveDistance) {
          _patrolDelta.normalize()
          facingDirection.current.copy(_patrolDelta)

          enemyRef.current.setLinvel(
            {
              x: _patrolDelta.x * speed * E.patrol.speedFactor,
              y: enemyRef.current.linvel().y,
              z: _patrolDelta.z * speed * E.patrol.speedFactor,
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

    return (
      <RigidBody
        ref={enemyRef}
        colliders={false}
        position={position}
        enabledRotations={[false, false, false]}
        linearDamping={E.linearDamping}
      >
        <CuboidCollider
          args={[
            BODY.colliderHalfExtents[0] * scale,
            BODY.colliderHalfExtents[1] * scale,
            BODY.colliderHalfExtents[2] * scale,
          ]}
        />

        <group ref={visualGroupRef} position={[0, modelYOffset, 0]}>
          <HumanoidModel
            color={isAttacking ? '#ffffff' : def.color}
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

        </group>

        {/* Health bar: outside the rotating visual group and billboarded so it
            always faces the camera instead of going edge-on as the enemy turns. */}
        <Billboard position={[0, 1.5 * scale + modelYOffset, 0]}>
          {/* Health bar background */}
          <mesh position={[0, 0, 0]} renderOrder={1000}>
            <boxGeometry args={[1.2, 0.15, 0.02]} />
            <meshBasicMaterial color="#333333" depthTest={false} />
          </mesh>

          {/* Health bar fill */}
          <mesh
            position={[-(1.2 * (1 - health / maxHealth)) / 2, 0, 0.01]}
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
          <mesh position={[0, 0, 0.02]} renderOrder={1002}>
            <boxGeometry args={[1.24, 0.19, 0.01]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
          </mesh>
        </Billboard>
      </RigidBody>
    )
  }
)
