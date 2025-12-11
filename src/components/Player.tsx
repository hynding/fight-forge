import { useRef, useState, useEffect, forwardRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Vector3, Euler } from 'three'
import { useControls } from '../hooks/useControls'
import { HumanoidModel } from './HumanoidModel'
import { useGameStore } from '../store/gameStore'

interface PlayerProps {
  onAttackChange?: (isAttacking: boolean, direction: Vector3) => void
}

export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ onAttackChange }, ref) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const playerRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
  const controls = useControls()
  const [isGrounded, setIsGrounded] = useState(false)
  const [isAttacking, setIsAttacking] = useState(false)
  const [attackCooldown, setAttackCooldown] = useState(0)
  const [isHurt, setIsHurt] = useState(false)
  const lastDirection = useRef(new Vector3(0, 0, -1)) // Default forward
  const playerHealth = useGameStore((state) => state.playerHealth)
  const prevHealth = useRef(playerHealth)
  const animationTime = useRef(0)
  const [isMoving, setIsMoving] = useState(false)

  const SPEED = 5
  const JUMP_FORCE = 8
  const ATTACK_COOLDOWN = 500

  useEffect(() => {
    if (attackCooldown > 0) {
      const timer = setTimeout(() => setAttackCooldown(0), attackCooldown)
      return () => clearTimeout(timer)
    }
  }, [attackCooldown])

  // Flash red when taking damage
  useEffect(() => {
    if (playerHealth < prevHealth.current) {
      setIsHurt(true)
      setTimeout(() => setIsHurt(false), 200)
    }
    prevHealth.current = playerHealth
  }, [playerHealth])

  useFrame((_, delta) => {
    if (!playerRef.current) return

    const velocity = playerRef.current.linvel()
    const DECELERATION = 0.85

    // Update animation time
    animationTime.current += delta

    // Calculate desired velocity
    let targetVelX = 0
    let targetVelZ = 0

    if (controls.forward) targetVelZ = -SPEED
    else if (controls.backward) targetVelZ = SPEED

    if (controls.left) targetVelX = -SPEED
    else if (controls.right) targetVelX = SPEED

    // Smooth interpolation for better feel
    let newVelX = velocity.x
    let newVelZ = velocity.z

    if (targetVelX !== 0 || targetVelZ !== 0) {
      // Accelerating - instant for responsive controls
      newVelX = targetVelX
      newVelZ = targetVelZ
    } else {
      // Decelerating - smooth stop
      newVelX *= DECELERATION
      newVelZ *= DECELERATION

      // Stop completely when very slow
      if (Math.abs(newVelX) < 0.1) newVelX = 0
      if (Math.abs(newVelZ) < 0.1) newVelZ = 0
    }

    // Track last direction moved and animation state
    const isCurrentlyMoving = Math.abs(newVelX) > 0.1 || Math.abs(newVelZ) > 0.1
    setIsMoving(isCurrentlyMoving)

    if (newVelX !== 0 || newVelZ !== 0) {
      lastDirection.current.set(newVelX, 0, newVelZ).normalize()
    }

    // Apply movement velocity
    playerRef.current.setLinvel(
      { x: newVelX, y: velocity.y, z: newVelZ },
      true
    )

    // Jump
    if (controls.jump && isGrounded) {
      playerRef.current.setLinvel(
        { x: newVelX, y: JUMP_FORCE, z: newVelZ },
        true
      )
    }

    // Attack
    if (controls.attack && !isAttacking && attackCooldown === 0) {
      setIsAttacking(true)
      onAttackChange?.(true, lastDirection.current.clone())
      setAttackCooldown(ATTACK_COOLDOWN)
      setTimeout(() => {
        setIsAttacking(false)
        onAttackChange?.(false, new Vector3())
      }, 200)
    }

    // Check if grounded
    const position = playerRef.current.translation()
    setIsGrounded(position.y < 1.1)
  })

  // Calculate rotation based on movement direction
  // atan2 gives angle from -Z axis (forward), rotate to face movement direction
  const rotation = new Euler(
    0,
    Math.atan2(-lastDirection.current.x, -lastDirection.current.z),
    0
  )

  return (
    <RigidBody
      ref={playerRef}
      colliders={false}
      position={[0, 2, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={1}
    >
      <CuboidCollider args={[0.25, 1, 0.25]} />

      {/* Player humanoid model */}
      <group rotation={rotation}>
        <HumanoidModel
          color={isHurt ? '#ff0000' : isAttacking ? '#ff4444' : '#4444ff'}
          emissive={isAttacking || isHurt ? '#ff0000' : '#000000'}
          emissiveIntensity={isAttacking || isHurt ? 0.5 : 0}
          animationTime={animationTime.current}
          isMoving={isMoving}
        />

        {/* Attack hitbox - only visible during attack */}
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
