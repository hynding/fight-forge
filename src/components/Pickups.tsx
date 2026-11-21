import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Group, MeshStandardMaterial, Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { inPickupReach, type PickupInstance } from '../sim/pickups'
import { playSound } from '../audio/engine'
import { getBindings } from '../content/bindings'
import { promptLabel } from '../sim/input'
import type { WeaponModel } from '../sim/weapons'

/** A weapon lying on the floor, glowing, with a pick-up prompt while the player is close and empty-handed. */
const WeaponItem = ({ item, model, playerPositionRef }: { item: PickupInstance; model: WeaponModel; playerPositionRef: RefObject<Vector3> }) => {
  const material = useRef<MeshStandardMaterial>(null)
  const prompt = useRef<HTMLDivElement>(null)
  const loop = useSimLoop()
  const [w, h, d] = model.size
  useFrame(() => {
    if (material.current) material.current.emissiveIntensity = 0.35 + Math.sin(loop.time * 4) * 0.2
    const p = playerPositionRef.current
    const s = useGameStore.getState()
    const near = !!p && !s.playerWeapon && Math.hypot(p.x - item.x, p.z - item.z) <= getConfig().rules.pickupRadius
    if (prompt.current) prompt.current.style.display = near ? 'block' : 'none'
  })
  const thick = model.shape === 'box' ? d : w
  return (
    <group position={[item.x, thick / 2 + 0.02, item.z]}>
      {/* Lying down, its long side along the stage. */}
      <mesh rotation={[0, 0.4, Math.PI / 2]} castShadow>
        {model.shape === 'box' ? (
          <boxGeometry args={[w, h, d]} />
        ) : model.shape === 'cylinder' ? (
          <cylinderGeometry args={[w / 2, w / 2, h, 12]} />
        ) : (
          <sphereGeometry args={[w / 2, 12, 8]} />
        )}
        <meshStandardMaterial ref={material} color={model.color} emissive="#ffd27a" emissiveIntensity={0.35} metalness={0.5} roughness={0.4} />
      </mesh>
      <Html center position={[0, 2.1, 0]} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div
          ref={prompt}
          data-testid="weapon-prompt"
          style={{ display: 'none', color: '#ffd27a', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', textShadow: '0 0 3px #000, 0 2px 2px #000' }}
        >
          {promptLabel(getBindings(), 'attack', useGameStore.getState().inputDevice, useGameStore.getState().padLabels ?? 'xbox')}: PICK UP
        </div>
      </Html>
    </group>
  )
}

const Item = ({ item, playerPositionRef }: { item: PickupInstance; playerPositionRef: RefObject<Vector3> }) => {
  const def = getConfig().pickups[item.pickup]
  const weapon = def?.effect === 'weapon' && def.weapon ? getConfig().weapons[def.weapon] : undefined
  const ref = useRef<Group>(null)
  const loop = useSimLoop()
  // Bob and spin with game time, so it freezes with the game.
  useFrame(() => {
    if (!ref.current || !def) return
    ref.current.position.y = def.size + 0.15 + Math.sin(loop.time * 3) * 0.08
    ref.current.rotation.y = loop.time * 2
  })
  if (!def) return null
  if (weapon) return <WeaponItem item={item} model={weapon.model} playerPositionRef={playerPositionRef} />
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
 * any the player stands on (within `rules.pickupRadius`). Weapons stay until
 * the player picks one up with the attack button (Player).
 */
export const Pickups = ({ playerPositionRef }: { playerPositionRef: RefObject<Vector3> }) => {
  const pickups = useGameStore((state) => state.pickups)

  useSimSystem('pickups', SYSTEM_ORDER.pickups, () => {
    const player = playerPositionRef.current
    if (!player) return
    const store = useGameStore.getState()
    for (const item of store.pickups) {
      // Weapons wait to be picked up with the attack button.
      if (getConfig().pickups[item.pickup]?.effect === 'weapon') continue
      if (inPickupReach({ x: player.x, z: player.z }, item, getConfig().rules.pickupRadius)) {
        store.collectPickup(item.id)
        playSound(getConfig().audio.pickup)
      }
    }
  })

  return (
    <>
      {pickups.map((item) => (
        <Item key={item.id} item={item} playerPositionRef={playerPositionRef} />
      ))}
    </>
  )
}
