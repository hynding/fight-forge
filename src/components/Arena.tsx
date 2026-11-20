import { RigidBody } from '@react-three/rapier'
import { DEFAULT_CONFIG } from '../config/defaults'

const { size, floorThickness, wallHeight, wallThickness } = DEFAULT_CONFIG.arena
const half = size / 2
const wallY = wallHeight / 2

// [position, box size] for each of the four boundary walls.
const WALLS: [[number, number, number], [number, number, number]][] = [
  [[0, wallY, -half], [size, wallHeight, wallThickness]],
  [[0, wallY, half], [size, wallHeight, wallThickness]],
  [[-half, wallY, 0], [wallThickness, wallHeight, size]],
  [[half, wallY, 0], [wallThickness, wallHeight, size]],
]

export const Arena = () => {
  return (
    <>
      {/* Ground */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[size, floorThickness, size]} />
          <meshStandardMaterial color="#444444" />
        </mesh>
      </RigidBody>

      {/* Walls */}
      {WALLS.map(([position, box], i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={position}>
            <boxGeometry args={box} />
            <meshStandardMaterial color="#666666" />
          </mesh>
        </RigidBody>
      ))}

      {/* Grid lines on ground */}
      <gridHelper
        args={[size, size, '#888888', '#333333']}
        position={[0, floorThickness / 2 + 0.01, 0]}
      />
    </>
  )
}
