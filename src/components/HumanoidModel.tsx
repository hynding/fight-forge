interface HumanoidModelProps {
  color: string
  emissive?: string
  emissiveIntensity?: number
  scale?: number
  animationTime?: number
  isMoving?: boolean
}

export const HumanoidModel = ({
  color,
  emissive = '#000000',
  emissiveIntensity = 0,
  scale = 1,
  animationTime = 0,
  isMoving = false
}: HumanoidModelProps) => {
  // Walking animation - swing arms and legs
  const walkCycle = Math.sin(animationTime * 8) * 0.3 * (isMoving ? 1 : 0)

  // Arms swing opposite to legs
  const leftArmSwing = walkCycle
  const rightArmSwing = -walkCycle

  // Legs swing
  const leftLegSwing = -walkCycle * 1.2
  const rightLegSwing = walkCycle * 1.2

  return (
    <group scale={scale}>
      {/* Head - slight bob when walking */}
      <mesh position={[0, 0.85 + Math.abs(walkCycle) * 0.05, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Left Arm - swings when walking */}
      <group position={[-0.35, 0.5, 0]} rotation={[leftArmSwing, 0, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.15, 0.6, 0.15]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>

      {/* Right Arm - swings when walking */}
      <group position={[0.35, 0.5, 0]} rotation={[rightArmSwing, 0, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.15, 0.6, 0.15]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>

      {/* Left Leg - swings when walking */}
      <group position={[-0.15, -0.05, 0]} rotation={[leftLegSwing, 0, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <boxGeometry args={[0.18, 0.6, 0.18]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>

      {/* Right Leg - swings when walking */}
      <group position={[0.15, -0.05, 0]} rotation={[rightLegSwing, 0, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <boxGeometry args={[0.18, 0.6, 0.18]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>

      {/* Eyes (two small cubes) */}
      <mesh position={[-0.08, 0.9, -0.16]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.02]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0.08, 0.9, -0.16]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.02]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </group>
  )
}
