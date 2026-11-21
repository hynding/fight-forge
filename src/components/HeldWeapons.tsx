import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { getConfig } from '../content/active'
import { movePhase } from '../sim/moves'
import type { FighterRuntime } from '../sim/fighter'
import type { ProjectileShape } from '../sim/projectiles'

const CAPACITY = 48
const SHAPES: ProjectileShape[] = ['box', 'cylinder', 'sphere']

interface Props {
  playerRef: RefObject<RapierRigidBody>
  runtimes: Map<string, FighterRuntime>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}

/**
 * The weapons in fighters' hands, drawn as one instanced mesh per shape: a
 * hand weapon at the front of the body, tipped forward (swung down during a
 * move's active frames); an overhead one above the head. Visual only.
 */
export const HeldWeapons = ({ playerRef, runtimes, enemyRefs }: Props) => {
  const meshes = useRef<Record<ProjectileShape, InstancedMesh | null>>({ box: null, cylinder: null, sphere: null })
  const tmp = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), s: new Vector3(), q: new Quaternion(), e: new Euler(), c: new Color() }), [])

  useFrame(() => {
    const config = getConfig()
    const counts: Record<ProjectileShape, number> = { box: 0, cylinder: 0, sphere: 0 }
    runtimes.forEach((rt, name) => {
      if (!rt.weapon) return
      const def = config.weapons[rt.weapon.id]
      const body = name === 'player' ? playerRef.current : enemyRefs.get(name)?.current
      const mesh = def ? meshes.current[def.model.shape] : null
      if (!def || !body || !mesh || counts[def.model.shape] >= CAPACITY) return
      const t = body.translation()
      const [w, h, d] = def.model.size
      const f = rt.facing.x >= 0 ? 1 : -1
      if (def.hold === 'overhead') {
        tmp.p.set(t.x, t.y + rt.hurtbox.y + h / 2 * (def.model.shape === 'cylinder' ? 1 : 0.5), t.z)
        // Lying across the shoulders, its long side along the depth.
        tmp.q.setFromEuler(tmp.e.set(Math.PI / 2, 0, 0))
      } else {
        const move = rt.move.move ? config.moves[rt.move.move] : undefined
        const swinging = !!move && movePhase(move, rt.move.time) === 'active'
        // Held upright and tipped forward; swung down flat on the active frames.
        const tip = swinging ? Math.PI / 2 : Math.PI / 5
        tmp.p.set(t.x + f * (rt.hurtbox.x + 0.15 + (swinging ? h * 0.3 : 0)), t.y + 0.05 * rt.scale, t.z + 0.15)
        tmp.q.setFromEuler(tmp.e.set(0, 0, -f * tip))
      }
      if (def.model.shape === 'box') tmp.s.set(w, h, d)
      else if (def.model.shape === 'cylinder') tmp.s.set(w, h, w)
      else tmp.s.setScalar(w)
      const i = counts[def.model.shape]++
      mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s))
      mesh.setColorAt(i, tmp.c.set(def.model.color))
    })
    for (const shape of SHAPES) {
      const mesh = meshes.current[shape]
      if (!mesh) continue
      mesh.count = counts[shape]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={(m) => (meshes.current.box = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.5} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={(m) => (meshes.current.cylinder = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 1, 14]} />
        <meshStandardMaterial metalness={0.5} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={(m) => (meshes.current.sphere = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshStandardMaterial metalness={0.5} roughness={0.4} />
      </instancedMesh>
    </>
  )
}
