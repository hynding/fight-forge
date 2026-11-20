import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, RapierRigidBody, useRapier } from '@react-three/rapier'
import { Group } from 'three'
import { FighterModel } from './FighterModel'
import { DEFAULT_CONFIG, type ModelRef, type Vec3 } from '../config/defaults'
import { useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimSystem } from '../sim/simContext'
import {
  facingToYaw,
  isMoving,
  nextFighterState,
  stepVelocity,
  updateFacing,
  type FighterRuntime,
  type Intent,
  type MovementConfig,
} from '../sim/fighter'

const BODY = DEFAULT_CONFIG.body
const HURT_FLASH_MS = 200

export interface AttackVisual {
  /** Unscaled offset and box size; both are multiplied by the fighter's scale. */
  position: Vec3
  size: Vec3
  opacity: number
}

interface FighterBodyProps {
  /** Unique per fighter; names its sim system. */
  name: string
  position: Vec3
  scale?: number
  linearDamping: number
  movement: MovementConfig
  jumpVelocity: number
  model: ModelRef
  /** Before `scale`; defaults to `body.colliderHalfExtents`. */
  colliderHalfExtents?: Vec3
  color: string
  attackingColor: string
  attackVisual: AttackVisual
  /** Flashes red when this drops. */
  health: number
  /** Drives visuals only (attack tint and box). */
  isAttacking: boolean
  /** The controller: asked once per sim step for this fighter's intent. */
  getIntent: (body: RapierRigidBody, dt: number) => Intent
  /** Sim-time attack flag for the state machine. */
  isAttackingNow: () => boolean
  isDead?: () => boolean
  runtime: FighterRuntime
  /** Rendered at the body origin, outside the rotating model (e.g. a health bar). */
  children?: ReactNode
}

/**
 * The shared body of every fighter: rigid body and collider, movement and
 * jumping from a controller's Intent, facing, the fighter state machine, the
 * model, and the hurt flash. Player and Enemy differ only in their controller
 * and what they do with `intent.attack`.
 */
export const FighterBody = forwardRef<RapierRigidBody, FighterBodyProps>(
  (
    {
      name,
      position,
      scale = 1,
      linearDamping,
      movement,
      jumpVelocity,
      model,
      colliderHalfExtents = BODY.colliderHalfExtents,
      color,
      attackingColor,
      attackVisual,
      health,
      isAttacking,
      getIntent,
      isAttackingNow,
      isDead,
      runtime,
      children,
    },
    ref
  ) => {
    const ownRef = useRef<RapierRigidBody>(null)
    const bodyRef = (ref as RefObject<RapierRigidBody>) || ownRef
    const visualGroupRef = useRef<Group>(null)
    const animationTimeRef = useRef(0)
    const isMovingRef = useRef(false)
    const { world, rapier } = useRapier()
    const groundRay = useRef<InstanceType<typeof rapier.Ray> | null>(null)

    const [isHurt, setIsHurt] = useState(false)
    const prevHealth = useRef(health)
    useEffect(() => {
      const dropped = health < prevHealth.current
      prevHealth.current = health
      if (!dropped) return
      setIsHurt(true)
      const timer = setTimeout(() => setIsHurt(false), HURT_FLASH_MS)
      return () => clearTimeout(timer)
    }, [health])

    useSimSystem(`fighter:${name}`, SYSTEM_ORDER.fighters, (dt) => {
      const body = bodyRef.current
      if (!body) return
      const intent = getIntent(body, dt)
      runtime.intent = intent

      const vel = body.linvel()
      const next = stepVelocity({ x: vel.x, z: vel.z }, intent.move, movement, dt)
      let velY = vel.y

      // Grounded: a short downward ray that ignores this fighter's own body, so
      // floor, other fighters, and future platforms all count.
      const p = body.translation()
      if (!groundRay.current) {
        groundRay.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
      }
      groundRay.current.origin = { x: p.x, y: p.y, z: p.z }
      const hit = world.castRay(
        groundRay.current,
        BODY.groundRayLength * scale,
        true,
        undefined,
        undefined,
        undefined,
        body
      )
      let grounded = hit !== null && Math.abs(vel.y) < BODY.groundedMaxVelY

      if (intent.jump && grounded) {
        velY = jumpVelocity
        grounded = false
      }

      body.setLinvel({ x: next.x, y: velY, z: next.z }, true)

      runtime.velocity = next
      runtime.grounded = grounded
      updateFacing(runtime.facing, next, intent.face)
      runtime.state = nextFighterState({
        dead: isDead?.() ?? false,
        attacking: isAttackingNow(),
        grounded,
        moving: isMoving(next, movement.stopSpeed),
      })
    })

    // Visuals at render rate: animation clock, walk cycle flag, and facing.
    useFrame((_, frameDelta) => {
      const { isPaused, isGameOver } = useGameStore.getState()
      if (isPaused || isGameOver) return
      animationTimeRef.current += gameStep(frameDelta)
      isMovingRef.current = isMoving(runtime.velocity, movement.stopSpeed)
      if (visualGroupRef.current) {
        visualGroupRef.current.rotation.y = facingToYaw(runtime.facing)
      }
    })

    const tint = isHurt ? '#ff0000' : isAttacking ? attackingColor : color
    const glowing = isHurt || isAttacking
    const [hx, hy, hz] = colliderHalfExtents
    const [ax, ay, az] = attackVisual.position
    const [sx, sy, sz] = attackVisual.size

    return (
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={position}
        enabledRotations={[false, false, false]}
        linearDamping={linearDamping}
        angularDamping={1}
      >
        <CuboidCollider args={[hx * scale, hy * scale, hz * scale]} />

        <group ref={visualGroupRef}>
          <FighterModel
            model={model}
            color={tint}
            emissive={glowing ? '#ff0000' : '#000000'}
            emissiveIntensity={glowing ? 0.5 : 0}
            scale={scale}
            runtime={runtime}
            animationTimeRef={animationTimeRef}
            isMovingRef={isMovingRef}
          />

          {isAttacking && (
            <mesh position={[ax * scale, ay * scale, az * scale]}>
              <boxGeometry args={[sx * scale, sy * scale, sz * scale]} />
              <meshBasicMaterial
                color="#ff0000"
                transparent
                opacity={attackVisual.opacity}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>

        {children}
      </RigidBody>
    )
  }
)
FighterBody.displayName = 'FighterBody'
