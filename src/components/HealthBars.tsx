import { useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { getConfig } from '../content/active'
import { useGameStore } from '../store/gameStore'

const WIDTH = 1.2
const HEIGHT = 0.15
const BORDER = 0.04

const GREEN = new Color('#00ff00')
const YELLOW = new Color('#ffff00')
const RED = new Color('#ff0000')

/**
 * Every enemy's health bar, drawn as three instanced meshes (border, track,
 * fill) instead of three meshes per enemy, facing the camera above each enemy.
 * Grows its capacity when a fight has more enemies than it holds.
 */
export const HealthBars = ({ enemyRefs }: { enemyRefs: Map<string, RefObject<RapierRigidBody>> }) => {
  const [capacity, setCapacity] = useState(64)
  const border = useRef<InstancedMesh>(null)
  const track = useRef<InstancedMesh>(null)
  const fill = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), s: new Vector3(), right: new Vector3(), q: new Quaternion() }), [])

  useFrame(({ camera }) => {
    const b = border.current
    const t = track.current
    const f = fill.current
    if (!b || !t || !f) return
    const enemies = useGameStore.getState().enemies
    if (enemies.length > capacity) {
      setCapacity(capacity * 2)
      return
    }
    const config = getConfig()
    tmp.q.copy(camera.quaternion)
    tmp.right.set(1, 0, 0).applyQuaternion(tmp.q)
    let n = 0
    for (const e of enemies) {
      const body = enemyRefs.get(e.id)?.current
      const def = config.enemyTypes[e.type]
      if (!body || !def) continue
      const at = body.translation()
      const halfHeight = (def.colliderHalfExtents ?? config.body.colliderHalfExtents)[1] * def.scale
      tmp.p.set(at.x, at.y + halfHeight + 0.15 * def.scale, at.z)
      const ratio = Math.max(0, Math.min(1, e.health / e.maxHealth))
      b.setMatrixAt(n, tmp.m.compose(tmp.p, tmp.q, tmp.s.set(WIDTH + BORDER, HEIGHT + BORDER, 1)))
      t.setMatrixAt(n, tmp.m.compose(tmp.p, tmp.q, tmp.s.set(WIDTH, HEIGHT, 1)))
      // The fill shrinks toward the left end.
      const fillAt = tmp.p.clone().addScaledVector(tmp.right, -(WIDTH * (1 - ratio)) / 2)
      f.setMatrixAt(n, tmp.m.compose(fillAt, tmp.q, tmp.s.set(Math.max(1e-4, WIDTH * ratio), HEIGHT, 1)))
      f.setColorAt(n, ratio > 0.5 ? GREEN : ratio > 0.25 ? YELLOW : RED)
      n++
    }
    for (const mesh of [b, t, f]) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }
    if (f.instanceColor) f.instanceColor.needsUpdate = true
  })

  return (
    <group key={capacity}>
      <instancedMesh ref={border} args={[undefined, undefined, capacity]} frustumCulled={false} renderOrder={1000}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={track} args={[undefined, undefined, capacity]} frustumCulled={false} renderOrder={1001}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#333333" depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={fill} args={[undefined, undefined, capacity]} frustumCulled={false} renderOrder={1002}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </instancedMesh>
    </group>
  )
}
