import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import type { Vector3 } from 'three'
import { assignDetail } from '../sim/budget'
import { useModelBudget } from '../sim/simContext'

/** Re-ranks the scene's skinned models by distance from the player, four times a second. */
export const ModelBudgetDriver = ({
  playerPositionRef,
  enemyRefs,
}: {
  playerPositionRef: RefObject<Vector3>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}) => {
  const budget = useModelBudget()
  const since = useRef(Infinity)
  useFrame((_, delta) => {
    since.current += delta
    if (!budget || since.current < 0.25) return
    since.current = 0
    const p = playerPositionRef.current
    if (!p) return
    assignDetail(budget, (name) => {
      if (name === 'player') return 0
      const body = enemyRefs.get(name)?.current
      if (!body) return null
      const t = body.translation()
      return Math.hypot(t.x - p.x, t.z - p.z)
    })
  })
  return null
}
