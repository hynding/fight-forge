import { forwardRef, useEffect, useMemo, useRef, useState, RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
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
import { createBrawlerMemory, enemyIntent, type BrawlerConfig } from '../sim/controllers'
import { createFighterRuntime, idleIntent, isBusy, type FighterRuntime, type Vec2 } from '../sim/fighter'
import { stageBounds, type StageView } from '../sim/stage'
import { FighterBody } from './FighterBody'

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

/** An enemy: a FighterBody driven by its type's AI archetype (`def.ai`). */
export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs, stageLength, view, runtimes }, ref) => {
    // Re-render when packs are reinstalled (a Forge playtest edit), so the steps below see the new tuning.
    useGameStore((state) => state.packs)
    const config = getConfig()
    const { enemy: E, body: BODY, moves: MOVES } = config
    const def = config.enemyTypes[type]
    const [runtime] = useState(createFighterRuntime)
    const memory = useRef(createBrawlerMemory())
    // Attack-slot hold/recovery countdowns, stepped by the sim (game time).
    const slotTimer = useRef(createAttackSlotTimer())
    // Set by the AI when it's in reach and wants to hit; acted on by the slot system.
    const wantsAttack = useRef(false)
    const ai = useMemo<BrawlerConfig>(() => ({ ...E, aggroRange: E.aggroRange * def.aggression }), [E, def.aggression])
    const behavior = config.ai[def.ai]
    const attackMove = def.attackMove ?? E.attackMove
    const movement = useMemo(
      () => ({ walkSpeed: def.speed, deceleration: E.deceleration, stopSpeed: BODY.stopSpeed }),
      [def.speed, E.deceleration, BODY.stopSpeed]
    )

    const isAttacking = useGameStore((state) => state.attackTokens.holders.includes(id))
    const health = useGameStore(
      (state) => state.enemies.find((e) => e.id === id)?.health ?? def.maxHealth
    )

    useEffect(() => {
      runtime.armor = def.armor ?? 0
      runtimes.set(id, runtime)
      return () => {
        runtimes.delete(id)
      }
    }, [runtimes, id, runtime, def.armor])

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

      const { holders } = useGameStore.getState().attackTokens
      const intent = enemyIntent(
        {
          self: { x: self.x, z: self.z },
          target: { x: target.x, z: target.z },
          targetFacingX: runtimes.get('player')?.facing.x,
          others,
          tokensTaken: holders.length >= config.rules.maxSimultaneousAttackers && !holders.includes(id),
          // Off screen (walking in, or left behind by the camera): come and fight.
          forceEngage: Math.abs(self.x - view.cameraX) > view.halfWidth,
        },
        memory.current,
        ai,
        behavior,
        dt
      )

      wantsAttack.current = intent.attack
      return intent
    }

    // The attack token and the enemy's move, after the fighter step and before
    // combat. An enemy in attack position queues for a token (longest-waiting
    // first); getting one throws its attack move. When the hold ends (or the
    // enemy is hit), it gives the token back and waits out the recovery so
    // others get a turn. Death and unmount are handled by the store, which
    // forgets the enemy's token and queue place.
    // Read live store state; a render-time selector can be frames stale.
    useSimSystem(`enemyAttackSlot:${id}`, SYSTEM_ORDER.enemyAttackSlot, (dt) => {
      stepMoveRunner(runtime.move, false, dt, MOVES, attackMove)
      const store = useGameStore.getState()
      const holding = store.attackTokens.holders.includes(id)

      if (runtime.reaction.kind !== null && holding) {
        releaseAttackSlotEarly(slotTimer.current, E)
        store.releaseAttackToken(id)
        return
      }
      if (stepAttackSlot(slotTimer.current, dt, E)) {
        if (holding) store.releaseAttackToken(id)
        return
      }
      if (holding) return

      const eligible = wantsAttack.current && !isBusy(runtime) && canClaimAttackSlot(slotTimer.current)
      if (!eligible) {
        store.cancelAttackRequest(id)
        return
      }
      if (store.requestAttackToken(id)) {
        startAttackSlotHold(slotTimer.current, E)
        startMove(runtime.move, attackMove)
      }
    })

    const scale = def.scale

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
        getBounds={() => stageBounds(stageLength, config.stage.depthBand)}
        runtime={runtime}
      />
    )
  }
)
Enemy.displayName = 'Enemy'
