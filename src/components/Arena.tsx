import { RigidBody } from '@react-three/rapier'

export const Arena = () => {
  return (
    <>
      {/* Ground */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[30, 0.5, 30]} />
          <meshStandardMaterial color="#444444" />
        </mesh>
      </RigidBody>

      {/* Walls */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 2, -15]}>
          <boxGeometry args={[30, 4, 0.5]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 2, 15]}>
          <boxGeometry args={[30, 4, 0.5]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-15, 2, 0]}>
          <boxGeometry args={[0.5, 4, 30]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[15, 2, 0]}>
          <boxGeometry args={[0.5, 4, 30]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
      </RigidBody>

      {/* Grid lines on ground */}
      <gridHelper args={[30, 30, '#888888', '#333333']} position={[0, 0.26, 0]} />
    </>
  )
}
