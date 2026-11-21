import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, RapierRigidBody, useRapier } from '@react-three/rapier'
import { Group, Mesh } from 'three'
import { FighterModel } from './FighterModel'
import type { ModelRef, Vec3 } from '../config/defaults'
import { getConfig } from '../content/active'
import { isFrozen, useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'
import { SYSTEM_ORDER } from '../sim/loop'
import { clampToBounds, type Bounds } from '../sim/stage'
import { useSimSystem } from '../sim/simContext'
import { interruptMove, movePhase } from '../sim/moves'
import { canDodge, isDodging, startDodge, stepDodge } from '../sim/defense'
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
      colliderHalfExtents = getConfig().body.colliderHalfExtents,
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
    const guardRef = useRef<Mesh>(null)
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
      stepReaction(runtime.reaction, dt, getConfig().reactions)
      stepDodge(runtime.dodge, dt)

      const intent = getIntent(body, dt)
      runtime.intent = intent
      const vel = body.linvel()

      // Grounded: a short downward ray that ignores this fighter's own body, so
      // floor, other fighters, and future platforms all count.
      const p = body.translation()
      if (!groundRay.current) {
        groundRay.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
      }
      groundRay.current.origin = { x: p.x, y: p.y, z: p.z }
      const hit = world.castRay(
        groundRay.current,
        getConfig().body.groundRayLength * scale,
        true,
        undefined,
        undefined,
        undefined,
        body
      )
      let grounded = hit !== null && Math.abs(vel.y) < getConfig().body.groundedMaxVelY

      // An air move ends when the fighter lands.
      const current = runtime.move.move ? getConfig().moves[runtime.move.move] : null
      if (current?.air && grounded) interruptMove(runtime.move)

      // Dodge on a press, from the ground, when free.
      const dodgePressed = !!intent.dodge && !runtime.dodgeHeld
      runtime.dodgeHeld = !!intent.dodge
      if (dodgePressed && grounded && !isBusy(runtime) && canDodge(runtime.dodge)) {
        startDodge(runtime.dodge, intent.move.z, getConfig().actions.dodge)
      }

      // During a move, a hit reaction or a dodge the controller can't walk, jump or turn.
      const busy = isBusy(runtime)
      const reaction = runtime.reaction.kind
      // Guard while holding block on the ground; blockstun keeps the guard up.
      runtime.blocking = !!intent.block && grounded && (!busy || reaction === 'blockstun')
      const running = !busy && !runtime.blocking && !!intent.run

      const move = runtime.move.move ? getConfig().moves[runtime.move.move] : null
      let next
      if (reaction !== null) {
        // Slide with the knockback that combat set on the runtime; a thrown fighter keeps its speed until it lands.
        const f = runtime.thrown && !grounded ? 1 : Math.pow(getConfig().reactions.knockbackFriction, dt * 60)
        next = { x: runtime.velocity.x * f, z: runtime.velocity.z * f }
      } else if (isDodging(runtime.dodge)) {
        next = { x: 0, z: runtime.dodge.dirZ * getConfig().actions.dodge.speed }
      } else if (move?.air) {
        next = { x: vel.x, z: vel.z } // keep the jump's arc
      } else if (move?.lunge && movePhase(move, runtime.move.time) !== 'recovery') {
        next = { x: runtime.facing.x * move.lunge, z: 0 }
      } else {
        const want = busy || runtime.blocking ? { x: 0, z: 0 } : intent.move
        const factor = running ? getConfig().actions.run.speedFactor : 1
        next = stepVelocity({ x: vel.x, z: vel.z }, { x: want.x * factor, z: want.z }, movement, dt)
      }
      let velY = vel.y

      if (intent.jump && grounded && !busy && !runtime.blocking) {
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
      // While guarding, the held direction turns the guard without walking.
      if (!busy) updateFacing(runtime.facing, next, runtime.blocking ? intent.move : intent.face)
      runtime.state = nextFighterState({
        dead: isDead?.() ?? false,
        reaction,
        dodging: isDodging(runtime.dodge),
        attacking: runtime.move.move !== null,
        grabbing: runtime.grab.target !== null,
        blocking: runtime.blocking,
        grounded,
        moving: isMoving(next, movement.stopSpeed),
        running,
      })
    })

    // Visuals at render rate: animation clock, walk cycle flag, and facing.
    useFrame((_, frameDelta) => {
      if (isFrozen(useGameStore.getState())) return
      animationTimeRef.current += gameStep(frameDelta)
      isMovingRef.current = isMoving(runtime.velocity, movement.stopSpeed)
      if (visualGroupRef.current) {
        visualGroupRef.current.rotation.y = facingToYaw(runtime.facing)
        // Blink while invulnerable after getting up or respawning.
        const r = runtime.reaction
        const blinking = r.invulnerableLeft > 0 && r.kind === null
        visualGroupRef.current.visible = !blinking || Math.floor(animationTimeRef.current * 15) % 2 === 0
      }
    })

    // Guard: a translucent shield on the side the fighter faces while blocking.
    useFrame(() => {
      const guard = guardRef.current
      if (!guard) return
      guard.visible = runtime.blocking
      guard.position.x = runtime.facing.x * (hx + 0.2) * scale
    })

    // Debug overlay: place the active hitbox (the body doesn't rotate, so body
    // space is world axes).
    useFrame(() => {
      const mesh = hitboxRef.current
      if (!mesh) return
      const name = runtime.move.move
      const move = name ? getConfig().moves[name] : null
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
            name={name}
            animationTimeRef={animationTimeRef}
            isMovingRef={isMovingRef}
          />
        </group>

        <mesh ref={guardRef} visible={false}>
          <boxGeometry args={[0.08 * scale, 1.5 * scale, 0.9 * scale]} />
          <meshBasicMaterial color="#66aaff" transparent opacity={0.35} depthWrite={false} />
        </mesh>

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
