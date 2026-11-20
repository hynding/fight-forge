import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import type { PropInstance } from '../sim/props'

const Prop = ({ item }: { item: PropInstance }) => {
  const def = getConfig().props[item.prop]
  if (!def) return null
  const floorTop = getConfig().stage.floorThickness / 2
  const [sx, sy, sz] = def.size
  const position: [number, number, number] = [item.x, floorTop + item.y + sy / 2, item.z]
  const mesh = (
    <mesh castShadow receiveShadow>
      {def.shape === 'cylinder' ? <cylinderGeometry args={[sx / 2, sx / 2, sy, 20]} /> : <boxGeometry args={def.size} />}
      <meshStandardMaterial color={def.color} roughness={0.85} />
    </mesh>
  )
  if (!def.solid) return <group position={position}>{mesh}</group>
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      {def.shape === 'cylinder' ? (
        <CylinderCollider args={[sy / 2, sx / 2]} />
      ) : (
        <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} />
      )}
      {mesh}
    </RigidBody>
  )
}

/**
 * The level's props (from the store, placed by the level director). Solid ones
 * are fixed colliders, so fighters bump into them and can stand on them; a
 * broken prop leaves the store and disappears. Combat breaks them.
 */
export const Props = () => {
  const props = useGameStore((s) => s.props)
  return (
    <>
      {props.map((p) => (
        <Prop key={p.id} item={p} />
      ))}
    </>
  )
}
