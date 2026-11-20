import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, RapierRigidBody, useRapier } from '@react-three/rapier'
import { Group, Mesh } from 'three'
import { FighterModel } from './FighterModel'
import { DEFAULT_CONFIG, type ModelRef, type Vec3 } from '../config/defaults'
import { isFrozen, useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'
import { SYSTEM_ORDER } from '../sim/loop'
import { clampToBounds, type Bounds } from '../sim/stage'
import { useSimSystem } from '../sim/simContext'
import { movePhase } from '../sim/moves'
import { stepReaction } from '../sim/reactions'
import {
  facingToYaw,
  isBusy,
  isMoving,
  nextFighterState,
  stepVelocity,
  updateFacing,
  type FighterRuntime,
  type Intent,
  type MovementConfig,
} from '../sim/fighter'

const { body: BODY, moves: MOVES, reactions: REACTIONS } = DEFAULT_CONFIG
const HURT_FLASH_MS = 200

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
  /** Flashes red when this drops. */
  health: number
  /** Drives the attack tint only. */
  isAttacking: boolean
  /** The controller: asked once per sim step for this fighter's intent. */
  getIntent: (body: RapierRigidBody, dt: number) => Intent
  isDead?: () => boolean
  /** Where this fighter may stand (screen for the player, stage for enemies). */
  getBounds?: () => Bounds
  runtime: FighterRuntime
  /** Rendered at the body origin, outside the rotating model (e.g. a health bar). */
  children?: ReactNode
}

/**
 * The shared body of every fighter: rigid body and collider, movement and
 * jumping from a controller's Intent, facing, hit reactions (stun, knockback,
 * knockdown), the fighter state machine, the model, the hurt flash, and the
 * hitbox debug overlay. Player and Enemy differ only in their controller and
 * how they start moves (`runtime.move`).
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
      health,
      isAttacking,
      getIntent,
      isDead,
      getBounds,
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
    const hitboxRef = useRef<Mesh>(null)
    const showHitboxes = useGameStore((state) => state.showHitboxes)
    const [hx, hy, hz] = colliderHalfExtents

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
      runtime.scale = scale
      runtime.hurtbox = { x: hx * scale, y: hy * scale, z: hz * scale }
      stepReaction(runtime.reaction, dt, REACTIONS)

      const intent = getIntent(body, dt)
      runtime.intent = intent
      // During a move or a hit reaction the controller can't walk, jump or turn.
      const busy = isBusy(runtime)
      const reacting = runtime.reaction.kind !== null

      const vel = body.linvel()
      let next
      if (reacting) {
        // Slide with the knockback that combat set on the runtime.
        const f = Math.pow(REACTIONS.knockbackFriction, dt * 60)
        next = { x: runtime.velocity.x * f, z: runtime.velocity.z * f }
      } else {
        next = stepVelocity({ x: vel.x, z: vel.z }, busy ? { x: 0, z: 0 } : intent.move, movement, dt)
      }
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

      if (intent.jump && grounded && !busy) {
        velY = jumpVelocity
        grounded = false
      }

      // Keep inside the bounds: snap back and drop velocity pointing further out.
      if (getBounds) {
        const b = getBounds()
        const c = clampToBounds(p.x, p.z, b)
        if (c.changed) {
          body.setTranslation({ x: c.x, y: p.y, z: c.z }, true)
          if ((c.x <= b.minX && next.x < 0) || (c.x >= b.maxX && next.x > 0)) next.x = 0
          if ((c.z <= b.minZ && next.z < 0) || (c.z >= b.maxZ && next.z > 0)) next.z = 0
        }
      }

      body.setLinvel({ x: next.x, y: velY, z: next.z }, true)

      runtime.velocity = next
      runtime.grounded = grounded
      if (!busy) updateFacing(runtime.facing, next, intent.face)
      runtime.state = nextFighterState({
        dead: isDead?.() ?? false,
        reaction: runtime.reaction.kind,
        attacking: runtime.move.move !== null,
        grounded,
        moving: isMoving(next, movement.stopSpeed),
      })
    })

    // Visuals at render rate: animation clock, walk cycle flag, and facing.
    useFrame((_, frameDelta) => {
      if (isFrozen(useGameStore.getState())) return
      animationTimeRef.current += gameStep(frameDelta)
      isMovingRef.current = isMoving(runtime.velocity, movement.stopSpeed)
      if (visualGroupRef.current) {
        visualGroupRef.current.rotation.y = facingToYaw(runtime.facing)
      }
    })

    // Debug overlay: place the active hitbox (the body doesn't rotate, so body
    // space is world axes).
    useFrame(() => {
      const mesh = hitboxRef.current
      if (!mesh) return
      const name = runtime.move.move
      const move = name ? MOVES[name] : null
      mesh.visible = !!move && movePhase(move, runtime.move.time) === 'active'
      if (!move || !mesh.visible) return
      const hb = move.hitbox
      mesh.position.set(runtime.facing.x * hb.forward * scale, hb.up * scale, 0)
      mesh.scale.set(hb.halfX * 2 * scale, hb.halfY * 2 * scale, hb.halfZ * 2 * scale)
    })

    const tint = isHurt ? '#ff0000' : isAttacking ? attackingColor : color
    const glowing = isHurt || isAttacking

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
        </group>

        {showHitboxes && (
          <>
            <mesh>
              <boxGeometry args={[hx * 2 * scale, hy * 2 * scale, hz * 2 * scale]} />
              <meshBasicMaterial color="#44ff88" wireframe />
            </mesh>
            <mesh ref={hitboxRef} visible={false}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#ff3344" transparent opacity={0.45} depthWrite={false} />
            </mesh>
          </>
        )}

        {children}
      </RigidBody>
    )
  }
)
FighterBody.displayName = 'FighterBody'
