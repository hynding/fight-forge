import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { enemyCanHitPlayer, isInAttackCone } from '../sim/combat'
import type { PlayerAttackState } from '../sim/timers'

const PLAYER_ATTACK = DEFAULT_CONFIG.player.attack
const E = DEFAULT_CONFIG.enemy

interface CombatSystemProps {
  playerRef: React.RefObject<RapierRigidBody>
  attack: PlayerAttackState
  attackDirectionRef: RefObject<Vector3>
  enemyRefs: Map<string, React.RefObject<RapierRigidBody>>
  playerPositionRef: RefObject<Vector3>
}

export const CombatSystem = ({
  playerRef,
  attack,
  attackDirectionRef,
  enemyRefs,
  playerPositionRef,
}: CombatSystemProps) => {
  const loop = useSimLoop()
  const lastEnemyDamageTime = useRef<Map<string, number>>(new Map())
  const damagedEnemiesThisSwing = useRef<Set<string>>(new Set())
  const lastSwing = useRef(attack.swing)

  // Every rendered frame (even paused): copy the player's position into the
  // shared ref so the camera and enemy AI read the latest value.
  useFrame(() => {
    if (!playerRef.current || !playerPositionRef.current) return
    const p = playerRef.current.translation()
    playerPositionRef.current.set(p.x, p.y, p.z)
  })

  useSimSystem('combat', SYSTEM_ORDER.combat, () => {
    if (!playerRef.current) return
    // Read live store state; a render-time snapshot can lag the store by frames.
    const { attackingEnemyId, damagePlayer, damageEnemy } = useGameStore.getState()
    const playerPos = playerRef.current.translation()
    // Sim time, so the per-enemy damage cooldown freezes with everything else.
    const now = loop.time

    // A new swing may hit each enemy once.
    if (attack.swing !== lastSwing.current) {
      lastSwing.current = attack.swing
      damagedEnemiesThisSwing.current.clear()
    }

    // Forget cooldowns for enemies that no longer exist.
    lastEnemyDamageTime.current.forEach((_, enemyId) => {
      if (!enemyRefs.has(enemyId)) lastEnemyDamageTime.current.delete(enemyId)
    })

    enemyRefs.forEach((enemyRef, enemyId) => {
      if (!enemyRef.current) return
      const enemyPos = enemyRef.current.translation()

      if (
        attackingEnemyId === enemyId &&
        enemyCanHitPlayer(enemyPos, playerPos, now, lastEnemyDamageTime.current.get(enemyId), E)
      ) {
        damagePlayer(E.damage)
        lastEnemyDamageTime.current.set(enemyId, now)
      }

      if (
        attack.active &&
        attackDirectionRef.current &&
        !damagedEnemiesThisSwing.current.has(enemyId) &&
        isInAttackCone(playerPos, attackDirectionRef.current, enemyPos, PLAYER_ATTACK)
      ) {
        damageEnemy(enemyId, PLAYER_ATTACK.damage)
        damagedEnemiesThisSwing.current.add(enemyId)
      }
    })
  })

  return null
}
