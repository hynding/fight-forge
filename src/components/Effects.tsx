import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { getConfig } from '../content/active'
import { isFrozen, useGameStore } from '../store/gameStore'
import { sparkDirections, stepFeel, type Effect, type FeelState } from '../sim/feel'
import { useFeel } from '../sim/simContext'
import { gameStep } from '../utils/gameTime'

type Of<K extends Effect['kind']> = Extract<Effect, { kind: K }>

const SPARK_CAPACITY = 512
const DUST_CAPACITY = 256
const PUFFS = [-0.35, -0.12, 0.12, 0.35]

/**
 * Every spark and dust puff on screen as two instanced meshes, so a crowd
 * fight's hits cost two draw calls instead of a mesh (and a geometry) per
 * particle. Positions come from each effect's age every frame.
 */
const Particles = ({ feel }: { feel: FeelState }) => {
  const sparks = useRef<InstancedMesh>(null)
  const dust = useRef<InstancedMesh>(null)
  const dirs = useRef(new Map<number, { x: number; y: number }[]>())
  const tmp = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), s: new Vector3(), q: new Quaternion(), c: new Color() }), [])
  useFrame(() => {
    const sm = sparks.current
    const dm = dust.current
    if (!sm || !dm) return
    let ns = 0
    let nd = 0
    const live = new Set<number>()
    for (const e of feel.effects) {
      const t = e.age / e.life
      if (e.kind === 'sparks') {
        live.add(e.id)
        let d = dirs.current.get(e.id)
        if (!d) dirs.current.set(e.id, (d = sparkDirections(e.count, e.seed)))
        tmp.c.set(e.color)
        // Fast out, slowing down, shrinking away.
        const r = 0.9 * (1 - (1 - t) ** 2)
        const size = 0.07 * Math.max(0.01, 1 - t)
        for (const dir of d) {
          if (ns >= SPARK_CAPACITY) break
          tmp.p.set(e.x + dir.x * r, e.y + dir.y * r, e.z + 0.05)
          sm.setMatrixAt(ns, tmp.m.compose(tmp.p, tmp.q, tmp.s.setScalar(size)))
          sm.setColorAt(ns, tmp.c)
          ns++
        }
      } else if (e.kind === 'dust') {
        tmp.c.set(e.color)
        // Rising and spreading, then shrinking away in the last third.
        const size = (0.12 + t * 0.3) * (t > 0.66 ? (1 - t) / 0.34 : 1)
        for (const puff of PUFFS) {
          if (nd >= DUST_CAPACITY) break
          tmp.p.set(e.x + puff * (1 + t * 1.5), e.y + 0.1 + t * 0.35, e.z)
          dm.setMatrixAt(nd, tmp.m.compose(tmp.p, tmp.q, tmp.s.setScalar(Math.max(0.001, size))))
          dm.setColorAt(nd, tmp.c)
          nd++
        }
      }
    }
    for (const id of dirs.current.keys()) if (!live.has(id)) dirs.current.delete(id)
    for (const [mesh, n] of [[sm, ns], [dm, nd]] as const) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARK_CAPACITY]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={dust} args={[undefined, undefined, DUST_CAPACITY]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
    </>
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
 * Draws the scene's hit effects (instanced sparks and dust, damage numbers)
 * and ages them; combat adds them through `feelHit`. Re-renders only when
 * effects come or go (for the damage numbers).
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
      <Particles feel={feel} />
      {feel.effects.map((e) => (e.kind === 'number' ? <DamageNumber key={e.id} e={e} /> : null))}
    </>
  )
}
