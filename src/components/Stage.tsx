import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DEFAULT_CONFIG } from '../config/defaults'

const { length, depthBand, floorThickness, wallHeight, wallThickness } = DEFAULT_CONFIG.stage
const [minZ, maxZ] = depthBand
// The floor runs a little past both ends and from the back wall to past the
// front of the lane, so the camera never sees its edge.
const FLOOR_OVERHANG = 12
const FLOOR_FRONT = maxZ + 8
const BACK_Z = minZ - 0.5 - wallThickness / 2
const FLOOR_DEPTH = FLOOR_FRONT - BACK_Z
const FLOOR_CENTER_Z = (FLOOR_FRONT + BACK_Z) / 2
const TILE = 5

type V3 = [number, number, number]

/**
 * A static box with an explicit collider at an explicit position. Don't use
 * `colliders="cuboid"` on an offset mesh here: auto colliders are first built
 * at the body origin before the mesh's world matrix is known, and for a frame
 * the back wall sat on the player's spawn point and shoved them through the
 * floor.
 */
const SolidBox = ({ position, size, color }: { position: V3; size: V3; color: string }) => (
  <RigidBody type="fixed" colliders={false} position={position}>
    <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
    <mesh receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  </RigidBody>
)
const PILLAR_EVERY = 10

/**
 * A long side-scrolling strip from x = 0 to `stage.length`: floor with
 * alternating tiles (so scrolling reads), a back wall with pillars, the depth
 * lane's edges marked, and solid walls at both ends.
 */
export const Stage = () => {
  const tiles = useMemo(
    () => Array.from({ length: Math.ceil(length / TILE) }, (_, i) => i * TILE + TILE / 2),
    []
  )
  const pillars = useMemo(
    () => Array.from({ length: Math.floor(length / PILLAR_EVERY) + 1 }, (_, i) => i * PILLAR_EVERY),
    []
  )
  const top = floorThickness / 2

  return (
    <>
      <SolidBox
        position={[length / 2, 0, FLOOR_CENTER_Z]}
        size={[length + FLOOR_OVERHANG * 2, floorThickness, FLOOR_DEPTH]}
        color="#3a3a44"
      />

      {/* Every other tile slightly lighter, inside the lane. */}
      {tiles
        .filter((_, i) => i % 2 === 0)
        .map((x) => (
          <mesh key={x} receiveShadow position={[x, top + 0.005, (minZ + maxZ) / 2]}>
            <boxGeometry args={[TILE, 0.01, maxZ - minZ]} />
            <meshStandardMaterial color="#474756" />
          </mesh>
        ))}

      {/* Lane edges. */}
      {[minZ, maxZ].map((z) => (
        <mesh key={z} position={[length / 2, top + 0.01, z]}>
          <boxGeometry args={[length, 0.01, 0.06]} />
          <meshBasicMaterial color="#6a6a80" />
        </mesh>
      ))}

      {/* Back wall with pillars. */}
      <SolidBox
        position={[length / 2, wallHeight / 2, BACK_Z]}
        size={[length + FLOOR_OVERHANG * 2, wallHeight, wallThickness]}
        color="#55556a"
      />
      {pillars.map((x) => (
        <mesh key={x} castShadow position={[x, wallHeight / 2, BACK_Z + wallThickness]}>
          <boxGeometry args={[0.8, wallHeight, 0.6]} />
          <meshStandardMaterial color={x % (PILLAR_EVERY * 5) === 0 ? '#8a6a3a' : '#6c6c84'} />
        </mesh>
      ))}

      {/* Solid ends. */}
      {[-wallThickness / 2, length + wallThickness / 2].map((x) => (
        <SolidBox
          key={x}
          position={[x, wallHeight / 2, FLOOR_CENTER_Z]}
          size={[wallThickness, wallHeight, FLOOR_DEPTH]}
          color="#55556a"
        />
      ))}
    </>
  )
}
