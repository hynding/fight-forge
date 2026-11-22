import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { assignDetail } from '../sim/budget'
import { useModelBudget } from '../sim/simContext'
import { isPlayerId } from '../sim/players'
import { activePlayerIds, type ScenePlayers } from './scenePlayers'

/** Re-ranks the scene's skinned models by distance from the nearest player, four times a second. */
export const ModelBudgetDriver = ({
  players,
  enemyRefs,
}: {
  players: ScenePlayers
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}) => {
  const budget = useModelBudget()
  const since = useRef(Infinity)
  useFrame((_, delta) => {
    since.current += delta
    if (!budget || since.current < 0.25) return
    since.current = 0
    const ps = activePlayerIds().flatMap((id) => players.positions.get(id) ?? [])
    if (!ps.length) return
    assignDetail(budget, (name) => {
      if (isPlayerId(name)) return 0
      const body = enemyRefs.get(name)?.current
      if (!body) return null
      const t = body.translation()
      return Math.min(...ps.map((p) => Math.hypot(t.x - p.x, t.z - p.z)))
    })
  })
  return null
}
