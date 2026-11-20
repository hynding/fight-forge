import { forwardRef, useRef, useState, RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { Billboard } from '@react-three/drei'
import { Vector3 } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimSystem } from '../sim/simContext'
import {
  canClaimAttackSlot,
  createAttackSlotTimer,
  startAttackSlotHold,
  stepAttackSlot,
} from '../sim/timers'
import { brawlerIntent, createBrawlerMemory, type BrawlerConfig } from '../sim/controllers'
import { createFighterRuntime, idleIntent, type Vec2 } from '../sim/fighter'
import { FighterBody, type AttackVisual } from './FighterBody'

const E = DEFAULT_CONFIG.enemy
const BODY = DEFAULT_CONFIG.body
const ATTACK_VISUAL: AttackVisual = { position: [0, 0, -0.5], size: [1.5, 1.5, 1], opacity: 0.3 }
const HEALTH_BAR_WIDTH = 1.2

interface EnemyProps {
  id: string
  type: EnemyType
  position: [number, number, number]
  playerPositionRef: RefObject<Vector3>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}

/** An enemy: a FighterBody driven by the `brawler` AI controller. */
export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs }, ref) => {
    const def = DEFAULT_CONFIG.enemyTypes[type]
    const [runtime] = useState(createFighterRuntime)
    const memory = useRef(createBrawlerMemory())
    // Attack-slot hold/recovery countdowns, stepped by the sim (game time).
    const slotTimer = useRef(createAttackSlotTimer())
    const [ai] = useState<BrawlerConfig>(() => ({ ...E, aggroRange: E.aggroRange * def.aggression }))
    const [movement] = useState(() => ({
      walkSpeed: def.speed,
      deceleration: E.deceleration,
      stopSpeed: BODY.stopSpeed,
    }))

    const isAttacking = useGameStore((state) => state.attackingEnemyId === id)
    const health = useGameStore(
      (state) => state.enemies.find((e) => e.id === id)?.health ?? def.maxHealth
    )
    const maxHealth = useGameStore(
      (state) => state.enemies.find((e) => e.id === id)?.maxHealth ?? def.maxHealth
    )

    // AIController: decide, then claim the single attacker slot if asking to attack.
    // Read live store state; the render-time selector can be frames stale and
    // let two enemies claim the slot at once.
    const getIntent = (body: RapierRigidBody, dt: number) => {
      const self = body.translation()
      const target = playerPositionRef.current
      if (!target) return idleIntent()

      const others: Vec2[] = []
      enemyRefs.forEach((otherRef, otherId) => {
        if (otherId === id || !otherRef.current) return
        const o = otherRef.current.translation()
        others.push({ x: o.x, z: o.z })
      })

      const { attackingEnemyId, setAttackingEnemy } = useGameStore.getState()
      const intent = brawlerIntent(
        {
          self: { x: self.x, z: self.z },
          target: { x: target.x, z: target.z },
          others,
          slotTakenByOther: attackingEnemyId !== null && attackingEnemyId !== id,
        },
        memory.current,
        ai,
        dt
      )

      if (intent.attack && attackingEnemyId === null && canClaimAttackSlot(slotTimer.current)) {
        setAttackingEnemy(id)
        startAttackSlotHold(slotTimer.current, E)
      }
      return intent
    }

    // When the hold ends, back off (recovery) so other enemies get a turn, and
    // release the slot only if we still hold it. Death and unmount are handled
    // by the store, which clears the slot when the holder is removed.
    useSimSystem(`enemyAttackSlot:${id}`, SYSTEM_ORDER.enemyAttackSlot, (dt) => {
      if (!stepAttackSlot(slotTimer.current, dt, E)) return
      const { attackingEnemyId, setAttackingEnemy } = useGameStore.getState()
      if (attackingEnemyId === id) setAttackingEnemy(null)
    })

    const scale = def.scale
    const modelYOffset = BODY.modelYOffset * scale
    const ratio = health / maxHealth

    return (
      <FighterBody
        ref={ref}
        name={id}
        position={position}
        scale={scale}
        linearDamping={E.linearDamping}
        movement={movement}
        jumpVelocity={0}
        color={def.color}
        attackingColor="#ffffff"
        attackVisual={ATTACK_VISUAL}
        health={health}
        isAttacking={isAttacking}
        getIntent={getIntent}
        isAttackingNow={() => useGameStore.getState().attackingEnemyId === id}
        runtime={runtime}
      >
        {/* Health bar: outside the rotating model and billboarded so it always
            faces the camera instead of going edge-on as the enemy turns. */}
        <Billboard position={[0, 1.5 * scale + modelYOffset, 0]}>
          <mesh renderOrder={1000}>
            <boxGeometry args={[HEALTH_BAR_WIDTH, 0.15, 0.02]} />
            <meshBasicMaterial color="#333333" depthTest={false} />
          </mesh>
          <mesh position={[-(HEALTH_BAR_WIDTH * (1 - ratio)) / 2, 0, 0.01]} renderOrder={1001}>
            <boxGeometry args={[HEALTH_BAR_WIDTH * ratio, 0.15, 0.02]} />
            <meshBasicMaterial
              color={ratio > 0.5 ? '#00ff00' : ratio > 0.25 ? '#ffff00' : '#ff0000'}
              depthTest={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.02]} renderOrder={1002}>
            <boxGeometry args={[HEALTH_BAR_WIDTH + 0.04, 0.19, 0.01]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
          </mesh>
        </Billboard>
      </FighterBody>
    )
  }
)
Enemy.displayName = 'Enemy'
