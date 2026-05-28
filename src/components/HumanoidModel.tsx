import { useRef, useMemo, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial } from 'three'

// Shared geometries — one instance reused across every humanoid.
const headGeometry = new BoxGeometry(0.3, 0.3, 0.3)
const bodyGeometry = new BoxGeometry(0.5, 0.7, 0.3)
const armGeometry = new BoxGeometry(0.15, 0.6, 0.15)
const legGeometry = new BoxGeometry(0.18, 0.6, 0.18)
const eyeGeometry = new BoxGeometry(0.06, 0.06, 0.02)

// Eye material is constant — share across all humanoids.
const eyeMaterial = new MeshBasicMaterial({ color: '#000000' })

interface HumanoidModelProps {
  color: string
  emissive?: string
  emissiveIntensity?: number
  scale?: number
  animationTimeRef: RefObject<number>
  isMovingRef: RefObject<boolean>
}

export const HumanoidModel = ({
  color,
  emissive = '#000000',
  emissiveIntensity = 0,
  scale = 1,
  animationTimeRef,
  isMovingRef,
}: HumanoidModelProps) => {
  const headRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)

  const bodyMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
      }),
    [color, emissive, emissiveIntensity]
  )

  useFrame(() => {
    const t = animationTimeRef.current ?? 0
    const moving = isMovingRef.current ?? false
    const walkCycle = Math.sin(t * 8) * 0.3 * (moving ? 1 : 0)

    if (leftArmRef.current) leftArmRef.current.rotation.x = walkCycle
    if (rightArmRef.current) rightArmRef.current.rotation.x = -walkCycle
    if (leftLegRef.current) leftLegRef.current.rotation.x = -walkCycle * 1.2
    if (rightLegRef.current) rightLegRef.current.rotation.x = walkCycle * 1.2
    if (headRef.current) headRef.current.position.y = 0.85 + Math.abs(walkCycle) * 0.05
  })

  return (
    <group scale={scale}>
      {/* Head */}
      <group ref={headRef} position={[0, 0.85, 0]}>
        <mesh geometry={headGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Body */}
      <mesh position={[0, 0.3, 0]} geometry={bodyGeometry} material={bodyMaterial} castShadow />

      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.35, 0.5, 0]}>
        <mesh position={[0, -0.2, 0]} geometry={armGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.35, 0.5, 0]}>
        <mesh position={[0, -0.2, 0]} geometry={armGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.15, -0.05, 0]}>
        <mesh position={[0, -0.3, 0]} geometry={legGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.15, -0.05, 0]}>
        <mesh position={[0, -0.3, 0]} geometry={legGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Eyes */}
      <mesh position={[-0.08, 0.9, -0.16]} geometry={eyeGeometry} material={eyeMaterial} castShadow />
      <mesh position={[0.08, 0.9, -0.16]} geometry={eyeGeometry} material={eyeMaterial} castShadow />
    </group>
  )
}
