import { forwardRef, useEffect, useRef, useState, RefObject } from 'react'
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
  releaseAttackSlotEarly,
  startAttackSlotHold,
  stepAttackSlot,
} from '../sim/timers'
import { startMove, stepMoveRunner } from '../sim/moves'
import { brawlerIntent, createBrawlerMemory, type BrawlerConfig } from '../sim/controllers'
import { createFighterRuntime, idleIntent, isBusy, type FighterRuntime, type Vec2 } from '../sim/fighter'
import { stageBounds, type StageView } from '../sim/stage'
import { FighterBody } from './FighterBody'

const E = DEFAULT_CONFIG.enemy
const BODY = DEFAULT_CONFIG.body
const MOVES = DEFAULT_CONFIG.moves
const HEALTH_BAR_WIDTH = 1.2

interface EnemyProps {
  id: string
  type: EnemyType
  position: [number, number, number]
  playerPositionRef: RefObject<Vector3>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
  stageLength: number
  view: StageView
  /** Every fighter's live runtime by name; the enemy registers under its id. */
  runtimes: Map<string, FighterRuntime>
}

/** An enemy: a FighterBody driven by the `brawler` AI controller. */
export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs, stageLength, view, runtimes }, ref) => {
    const def = DEFAULT_CONFIG.enemyTypes[type]
    const [runtime] = useState(createFighterRuntime)
    const memory = useRef(createBrawlerMemory())
    // Attack-slot hold/recovery countdowns, stepped by the sim (game time).
    const slotTimer = useRef(createAttackSlotTimer())
    // Set by the AI when it's in reach and wants to hit; acted on by the slot system.
    const wantsAttack = useRef(false)
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

    useEffect(() => {
      runtimes.set(id, runtime)
      return () => {
        runtimes.delete(id)
      }
    }, [runtimes, id, runtime])

    // AIController: decide where to go and whether to attack.
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

      const { attackingEnemyId } = useGameStore.getState()
      const intent = brawlerIntent(
        {
          self: { x: self.x, z: self.z },
          target: { x: target.x, z: target.z },
          others,
          slotTakenByOther: attackingEnemyId !== null && attackingEnemyId !== id,
          // Off screen (walking in, or left behind by the camera): come and fight.
          forceEngage: Math.abs(self.x - view.cameraX) > view.halfWidth,
        },
        memory.current,
        ai,
        dt
      )

      wantsAttack.current = intent.attack
      return intent
    }

    // The single attacker slot and the enemy's move, after the fighter step and
    // before combat. Taking the slot throws one `enemy.attackMove`. When the
    // hold ends (or the enemy is hit), back off (recovery) so other enemies get
    // a turn, and release the slot only if we still hold it. Death and unmount
    // are handled by the store, which clears the slot when the holder is removed.
    // Read live store state; the render-time selector can be frames stale and
    // let two enemies claim the slot at once.
    useSimSystem(`enemyAttackSlot:${id}`, SYSTEM_ORDER.enemyAttackSlot, (dt) => {
      stepMoveRunner(runtime.move, false, dt, MOVES, E.attackMove)
      const { attackingEnemyId, setAttackingEnemy } = useGameStore.getState()
      const holding = attackingEnemyId === id

      if (runtime.reaction.kind !== null && holding) {
        releaseAttackSlotEarly(slotTimer.current, E)
        setAttackingEnemy(null)
        return
      }
      if (stepAttackSlot(slotTimer.current, dt, E)) {
        if (holding) setAttackingEnemy(null)
        return
      }
      if (
        wantsAttack.current &&
        !isBusy(runtime) &&
        attackingEnemyId === null &&
        canClaimAttackSlot(slotTimer.current)
      ) {
        setAttackingEnemy(id)
        startAttackSlotHold(slotTimer.current, E)
        startMove(runtime.move, E.attackMove)
      }
    })

    const scale = def.scale
    const halfHeight = (def.colliderHalfExtents ?? BODY.colliderHalfExtents)[1] * scale
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
        model={def.model}
        colliderHalfExtents={def.colliderHalfExtents}
        color={def.color}
        attackingColor="#ffffff"
        health={health}
        isAttacking={isAttacking}
        getIntent={getIntent}
        getBounds={() => stageBounds(stageLength, DEFAULT_CONFIG.stage.depthBand)}
        runtime={runtime}
      >
        {/* Health bar: outside the rotating model and billboarded so it always
            faces the camera instead of going edge-on as the enemy turns. */}
        <Billboard position={[0, halfHeight + 0.15 * scale, 0]}>
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
