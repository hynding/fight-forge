import { useRef, useState, useEffect, forwardRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider, useRapier } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { useControls } from '../hooks/useControls'
import { HumanoidModel } from './HumanoidModel'
import { useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'
import { DEFAULT_CONFIG } from '../config/defaults'

interface PlayerProps {
  onAttackChange?: (isAttacking: boolean, direction: Vector3) => void
}

const P = DEFAULT_CONFIG.player
const BODY = DEFAULT_CONFIG.body

export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ onAttackChange }, ref) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const playerRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
  const visualGroupRef = useRef<Group>(null)
  const controls = useControls()
  const isGroundedRef = useRef(false)
  const isMovingRef = useRef(false)
  const animationTimeRef = useRef(0)
  const lastDirection = useRef(new Vector3(0, 0, -1))
  // `isAttacking` state drives visuals only. Per-frame gating uses refs so that
  // frames rendered before React re-renders can't start a second swing.
  const [isAttacking, setIsAttacking] = useState(false)
  const attackTimeLeft = useRef(0)
  const cooldownTimeLeft = useRef(0)
  const [isHurt, setIsHurt] = useState(false)
  const playerHealth = useGameStore((state) => state.playerHealth)
  const prevHealth = useRef(playerHealth)

  const { world, rapier } = useRapier()
  const groundRay = useRef<InstanceType<typeof rapier.Ray> | null>(null)

  // Flash red when taking damage
  useEffect(() => {
    if (playerHealth < prevHealth.current) {
      setIsHurt(true)
      const timer = setTimeout(() => setIsHurt(false), 200)
      prevHealth.current = playerHealth
      return () => clearTimeout(timer)
    }
    prevHealth.current = playerHealth
  }, [playerHealth])

  useFrame((_, frameDelta) => {
    if (!playerRef.current) return
    const { isPaused, isGameOver } = useGameStore.getState()
    if (isPaused || isGameOver) return
    const delta = gameStep(frameDelta)

    animationTimeRef.current += delta

    const velocity = playerRef.current.linvel()

    let targetVelX = 0
    let targetVelZ = 0

    if (controls.forward) targetVelZ = -P.walkSpeed
    else if (controls.backward) targetVelZ = P.walkSpeed

    if (controls.left) targetVelX = -P.walkSpeed
    else if (controls.right) targetVelX = P.walkSpeed

    let newVelX = velocity.x
    let newVelZ = velocity.z

    if (targetVelX !== 0 || targetVelZ !== 0) {
      newVelX = targetVelX
      newVelZ = targetVelZ
    } else {
      // Deceleration is tuned per 60 Hz frame; scale by elapsed time so the
      // slide is roughly the same across refresh rates (not exact).
      const decel = Math.pow(P.deceleration, delta * 60)
      newVelX *= decel
      newVelZ *= decel
      if (Math.abs(newVelX) < BODY.stopSpeed) newVelX = 0
      if (Math.abs(newVelZ) < BODY.stopSpeed) newVelZ = 0
    }

    const isCurrentlyMoving =
      Math.abs(newVelX) > BODY.stopSpeed || Math.abs(newVelZ) > BODY.stopSpeed
    isMovingRef.current = isCurrentlyMoving

    if (newVelX !== 0 || newVelZ !== 0) {
      lastDirection.current.set(newVelX, 0, newVelZ).normalize()
    }

    playerRef.current.setLinvel({ x: newVelX, y: velocity.y, z: newVelZ }, true)

    // Grounded check: short downward ray that ignores the player's own body,
    // so standing on the floor, an enemy, or any future platform all count.
    const position = playerRef.current.translation()
    if (!groundRay.current) {
      groundRay.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    }
    groundRay.current.origin = { x: position.x, y: position.y, z: position.z }
    const groundHit = world.castRay(
      groundRay.current,
      P.groundRayLength,
      true,
      undefined,
      undefined,
      undefined,
      playerRef.current
    )
    isGroundedRef.current = groundHit !== null && Math.abs(velocity.y) < P.groundedMaxVelY

    // Jump
    if (controls.jump && isGroundedRef.current) {
      playerRef.current.setLinvel({ x: newVelX, y: P.jumpVelocity, z: newVelZ }, true)
      isGroundedRef.current = false
    }

    // Attack
    cooldownTimeLeft.current = Math.max(0, cooldownTimeLeft.current - delta)
    if (attackTimeLeft.current > 0) {
      attackTimeLeft.current -= delta
      if (attackTimeLeft.current <= 0) {
        attackTimeLeft.current = 0
        setIsAttacking(false)
        onAttackChange?.(false, new Vector3())
      }
    } else if (controls.attack && cooldownTimeLeft.current === 0) {
      attackTimeLeft.current = P.attack.duration
      cooldownTimeLeft.current = P.attack.cooldown
      setIsAttacking(true)
      onAttackChange?.(true, lastDirection.current.clone())
    }

    // Drive rotation imperatively from current facing direction
    if (visualGroupRef.current) {
      visualGroupRef.current.rotation.y = Math.atan2(
        -lastDirection.current.x,
        -lastDirection.current.z
      )
    }
  })

  return (
    <RigidBody
      ref={playerRef}
      colliders={false}
      position={P.spawnPosition}
      enabledRotations={[false, false, false]}
      linearDamping={P.linearDamping}
      angularDamping={1}
    >
      <CuboidCollider args={BODY.colliderHalfExtents} />

      <group ref={visualGroupRef} position={[0, BODY.modelYOffset, 0]}>
        <HumanoidModel
          color={isHurt ? '#ff0000' : isAttacking ? '#ff4444' : P.color}
          emissive={isAttacking || isHurt ? '#ff0000' : '#000000'}
          emissiveIntensity={isAttacking || isHurt ? 0.5 : 0}
          animationTimeRef={animationTimeRef}
          isMovingRef={isMovingRef}
        />

        {isAttacking && (
          <mesh position={[0, 0, -1.2]}>
            <boxGeometry args={[1.2, 1.5, 0.8]} />
            <meshBasicMaterial
              color="#ff0000"
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </RigidBody>
  )
})
