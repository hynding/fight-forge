import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { inPickupReach, type PickupInstance } from '../sim/pickups'

const Item = ({ item }: { item: PickupInstance }) => {
  const def = getConfig().pickups[item.pickup]
  const ref = useRef<Group>(null)
  const loop = useSimLoop()
  // Bob and spin with game time, so it freezes with the game.
  useFrame(() => {
    if (!ref.current || !def) return
    ref.current.position.y = def.size + 0.15 + Math.sin(loop.time * 3) * 0.08
    ref.current.rotation.y = loop.time * 2
  })
  if (!def) return null
  return (
    <group position={[item.x, 0, item.z]}>
      <group ref={ref}>
        {def.effect === 'score' ? (
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[def.size, def.size, def.size * 0.3, 20]} />
            <meshStandardMaterial color={def.color} metalness={0.6} roughness={0.3} emissive={def.color} emissiveIntensity={0.2} />
          </mesh>
        ) : (
          <mesh castShadow>
            <sphereGeometry args={[def.size, 16, 12]} />
            <meshStandardMaterial color={def.color} emissive={def.color} emissiveIntensity={0.25} />
          </mesh>
        )}
      </group>
    </group>
  )
}

/**
 * Pickups on the stage: renders them, and the `pickups` sim system collects
 * any the player stands on (within `rules.pickupRadius`).
 */
export const Pickups = ({ playerPositionRef }: { playerPositionRef: RefObject<Vector3> }) => {
  const pickups = useGameStore((state) => state.pickups)

  useSimSystem('pickups', SYSTEM_ORDER.pickups, () => {
    const player = playerPositionRef.current
    if (!player) return
    const store = useGameStore.getState()
    for (const item of store.pickups) {
      if (inPickupReach({ x: player.x, z: player.z }, item, getConfig().rules.pickupRadius)) store.collectPickup(item.id)
    }
  })

  return (
    <>
      {pickups.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </>
  )
}
