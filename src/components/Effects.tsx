import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { getConfig } from '../content/active'
import { isFrozen, useGameStore } from '../store/gameStore'
import { sparkDirections, stepFeel, type Effect } from '../sim/feel'
import { useFeel } from '../sim/simContext'
import { gameStep } from '../utils/gameTime'

type Of<K extends Effect['kind']> = Extract<Effect, { kind: K }>

const Sparks = ({ e }: { e: Of<'sparks'> }) => {
  const group = useRef<Group>(null)
  const [dirs] = useState(() => sparkDirections(e.count, e.seed))
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = e.age / e.life
    g.children.forEach((c, i) => {
      const d = dirs[i]
      // Fast out, slowing down, shrinking away.
      const r = 0.9 * (1 - (1 - t) ** 2)
      c.position.set(d.x * r, d.y * r, 0.05)
      c.scale.setScalar(Math.max(0.01, 1 - t))
    })
  })
  return (
    <group ref={group} position={[e.x, e.y, e.z]}>
      {dirs.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshBasicMaterial color={e.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

const PUFFS = [-0.35, -0.12, 0.12, 0.35]

const Dust = ({ e }: { e: Of<'dust'> }) => {
  const group = useRef<Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = e.age / e.life
    g.children.forEach((c, i) => {
      const m = c as Mesh
      m.position.set(PUFFS[i] * (1 + t * 1.5), 0.1 + t * 0.35, 0)
      m.scale.setScalar(0.12 + t * 0.3)
      ;(m.material as MeshBasicMaterial).opacity = 0.6 * (1 - t)
    })
  })
  return (
    <group ref={group} position={[e.x, e.y, e.z]}>
      {PUFFS.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={e.color} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

const DamageNumber = ({ e }: { e: Of<'number'> }) => {
  const group = useRef<Group>(null)
  const label = useRef<HTMLDivElement>(null)
  useFrame(() => {
    const t = e.age / e.life
    group.current?.position.set(e.x, e.y + 0.3 + t * 0.9, e.z)
    if (label.current) label.current.style.opacity = String(t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4)
  })
  return (
    <group ref={group} position={[e.x, e.y + 0.3, e.z]}>
      <Html center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div
          ref={label}
          data-testid="damage-number"
          style={{ color: e.color, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', textShadow: '0 0 3px #000, 0 2px 2px #000', userSelect: 'none' }}
        >
          {e.text}
        </div>
      </Html>
    </group>
  )
}

/**
 * Draws the scene's hit effects (sparks, dust, damage numbers) and ages them;
 * combat adds them through `feelHit`. Re-renders only when effects come or go.
 */
export const Effects = () => {
  const feel = useFeel()
  const [, setVersion] = useState(feel.version)
  const seen = useRef(feel.version)
  useFrame((_, delta) => {
    if (!isFrozen(useGameStore.getState())) stepFeel(feel, getConfig().feel, gameStep(delta))
    if (feel.version !== seen.current) {
      seen.current = feel.version
      setVersion(feel.version)
    }
  })
  return (
    <>
      {feel.effects.map((e) =>
        e.kind === 'sparks' ? <Sparks key={e.id} e={e} /> : e.kind === 'dust' ? <Dust key={e.id} e={e} /> : <DamageNumber key={e.id} e={e} />
      )}
    </>
  )
}
