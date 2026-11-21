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
import { interruptMove, startMove, stepMoveRunner } from '../sim/moves'
import { attackRangeAt, createBrawlerMemory, enemyIntent, type BrawlerConfig, type BrawlerContext } from '../sim/controllers'
import { createFighterRuntime, idleIntent, isBusy, type FighterRuntime, type Vec2 } from '../sim/fighter'
import { stageBounds, type StageView } from '../sim/stage'
import { attacksOf, farAttackReady, pickAttack, seededRandom, startCooldown, stepCooldowns, type AttackCooldowns } from '../sim/attacks'
import { bossPhaseIndex, createPoiseState, phaseStats, stepPoise, transitionPush, type SummonRequest } from '../sim/boss'
import { applyHit, isInvulnerable } from '../sim/reactions'
import { playSound } from '../audio/engine'
import { FighterBody } from './FighterBody'
import { armedAttacks, holdWeapon, type WeaponDef } from '../sim/weapons'
import type { AttackDef } from '../sim/attacks'

// An armed enemy's attacks, worked out once per weapon definition.
const armedCache = new WeakMap<WeaponDef, AttackDef[] | null>()
const armedAttacksOf = (def: WeaponDef): AttackDef[] | null => {
  if (!armedCache.has(def)) armedCache.set(def, armedAttacks(def))
  return armedCache.get(def) ?? null
}

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
  /** A boss's phase summons go here for the LevelDirector to spawn. */
  summons: SummonRequest[]
}

/**
 * An enemy: a FighterBody driven by its type's AI archetype (`def.ai`). It
 * picks one of its type's `attacks` by range and weight when it may attack.
 * A boss (`def.boss`) changes phase as its health drops (new stats, a taunt,
 * a push, summons), has poise, and by default its own attack slot.
 */
export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs, stageLength, view, runtimes, summons }, ref) => {
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
    const boss = def.boss
    // Boss phases started so far (0 = none); stats come from the phases reached.
    // A boss that arrives already hurt (a Forge sandbox "from phase N") starts
    // just before that phase, so only that phase's change plays.
    const [startPhase] = useState(() => {
      const me = useGameStore.getState().enemies.find((e) => e.id === id)
      return boss && me ? Math.max(0, bossPhaseIndex(boss.phases, me.health / me.maxHealth) - 1) : 0
    })
    const [phase, setPhase] = useState(startPhase)
    const phaseRef = useRef(startPhase)
    const stats = useMemo(
      () =>
        phaseStats(
          { speed: def.speed, aggression: def.aggression, armor: def.armor ?? 0, ai: def.ai, attacks: attacksOf(def, E.attackMove), color: def.color },
          boss?.phases ?? [],
          phase
        ),
      [def, boss, phase, E.attackMove]
    )
    const ownSlot = !!boss && !boss.sharesTokens
    // Seconds left in a phase change: invulnerable, standing its ground.
    const transitionLeft = useRef(0)
    const ownCooldowns = useRef<AttackCooldowns>([])
    const armedCooldowns = useRef<AttackCooldowns>([])
    // Armed: the weapon's moves in place of its own attacks (while it has some).
    const armed = () => {
      const w = runtime.weapon ? config.weapons[runtime.weapon.id] : undefined
      return w ? armedAttacksOf(w) : null
    }
    const currentAttacks = () => armed() ?? stats.attacks
    const cooldownsNow = () => (armed() ? armedCooldowns : ownCooldowns)
    const random = useMemo(() => seededRandom(id), [id])
    // Where the AI stood when it last asked to attack.
    const attackAt = useRef<'near' | 'far'>('near')
    const ai = useMemo<BrawlerConfig>(() => ({ ...E, aggroRange: E.aggroRange * stats.aggression }), [E, stats.aggression])
    const behavior = config.ai[stats.ai]
    const movement = useMemo(
      () => ({ walkSpeed: stats.speed, deceleration: E.deceleration, stopSpeed: BODY.stopSpeed }),
      [stats.speed, E.deceleration, BODY.stopSpeed]
    )

    const holdsToken = useGameStore((state) => state.attackTokens.holders.includes(id))
    const isAttacking = holdsToken || (ownSlot && runtime.move.move !== null)
    const health = useGameStore(
      (state) => state.enemies.find((e) => e.id === id)?.health ?? def.maxHealth
    )

    useEffect(() => {
      runtime.armor = stats.armor
      runtime.ownAttackSlot = ownSlot
    }, [runtime, stats.armor, ownSlot])

    useEffect(() => {
      runtime.poise = boss && boss.poise.hits > 0 ? { state: createPoiseState(), config: boss.poise } : null
    }, [runtime, boss])

    // An armed type starts with its weapon.
    const [startWeapon] = useState(() => def.weapon)
    useEffect(() => {
      const w = startWeapon ? config.weapons[startWeapon] : undefined
      if (startWeapon && w) runtime.weapon = holdWeapon(startWeapon, w)
      // Only on mount: a dropped weapon stays dropped.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runtime, startWeapon])

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

      const { holders } = useGameStore.getState().attackTokens
      const ctx: BrawlerContext = {
        self: { x: self.x, z: self.z },
        target: { x: target.x, z: target.z },
        targetFacingX: runtimes.get('player')?.facing.x,
        others,
        tokensTaken: !ownSlot && holders.length >= config.rules.maxSimultaneousAttackers && !holders.includes(id),
        // Off screen (walking in, or left behind by the camera): come and fight.
        forceEngage: Math.abs(self.x - view.cameraX) > view.halfWidth,
        farAttack: farAttackReady(currentAttacks(), cooldownsNow().current),
      }
      if (transitionLeft.current > 0) {
        wantsAttack.current = false
        return { ...idleIntent(), face: { x: target.x - self.x, z: 0 } }
      }
      const intent = enemyIntent(ctx, memory.current, ai, behavior, dt)

      wantsAttack.current = intent.attack
      attackAt.current = attackRangeAt(ctx, ai, behavior) ?? 'near'
      return intent
    }

    // The attack token and the enemy's move, after the fighter step and before
    // combat. An enemy in attack position queues for a token (longest-waiting
    // first); getting one throws its attack move. When the hold ends (or the
    // enemy is hit), it gives the token back and waits out the recovery so
    // others get a turn. Death and unmount are handled by the store, which
    // forgets the enemy's token and queue place.
    // Read live store state; a render-time selector can be frames stale.
    // A boss's phase change: cancel the move, go invulnerable and stand for
    // the transition, taunt, push the player away and call in the summons.
    const changePhase = (reached: number) => {
      const p = boss!.phases[reached - 1]
      const tr = boss!.transition
      interruptMove(runtime.move)
      runtime.reaction.invulnerableLeft = Math.max(runtime.reaction.invulnerableLeft, tr.duration)
      transitionLeft.current = tr.duration
      ownCooldowns.current = []
      playSound(p.taunt)
      const me = enemyRefs.get(id)?.current?.translation()
      const player = runtimes.get('player')
      const target = playerPositionRef.current
      if (me && player && target && !isInvulnerable(player.reaction)) {
        const push = transitionPush(tr, target.x - me.x, target.z - me.z)
        if (push !== 0 && applyHit(player.reaction, { hitstun: tr.duration, knockback: { x: 0, y: 0 } }, config.reactions)) {
          interruptMove(player.move)
          player.velocity = { x: push, z: 0 }
        }
      }
      if (p.summon && me) summons.push({ enemies: p.summon.enemies, x: me.x })
    }

    // The attack token and the enemy's move, after the fighter step and before
    // combat. An enemy in attack position queues for a token (longest-waiting
    // first); getting one throws one of its attacks. When the hold ends (or the
    // enemy is hit), it gives the token back and waits out the recovery so
    // others get a turn. A boss with its own slot runs the same hold and
    // recovery without the shared pool. Death and unmount are handled by the
    // store, which forgets the enemy's token and queue place.
    // Read live store state; a render-time selector can be frames stale.
    useSimSystem(`enemyAttackSlot:${id}`, SYSTEM_ORDER.enemyAttackSlot, (dt) => {
      stepMoveRunner(runtime.move, false, dt, MOVES, runtime.move.move ?? stats.attacks[0].move)
      if (runtime.move.move === null) runtime.weaponMove = false
      stepCooldowns(ownCooldowns.current, dt)
      stepCooldowns(armedCooldowns.current, dt)
      if (runtime.poise) stepPoise(runtime.poise.state, dt)
      transitionLeft.current = Math.max(0, transitionLeft.current - dt)
      const store = useGameStore.getState()

      if (boss) {
        const me = store.enemies.find((e) => e.id === id)
        const target = me ? bossPhaseIndex(boss.phases, me.health / me.maxHealth) : 0
        // One phase change at a time: a hit that crosses two plays both, in order.
        if (target > phaseRef.current && transitionLeft.current === 0) {
          phaseRef.current += 1
          setPhase(phaseRef.current)
          changePhase(phaseRef.current)
        }
      }

      const holding = ownSlot ? slotTimer.current.holdLeft > 0 : store.attackTokens.holders.includes(id)

      if (runtime.reaction.kind !== null && holding) {
        releaseAttackSlotEarly(slotTimer.current, E)
        if (!ownSlot) store.releaseAttackToken(id)
        return
      }
      if (stepAttackSlot(slotTimer.current, dt, E)) {
        if (holding && !ownSlot) store.releaseAttackToken(id)
        return
      }
      if (holding) return

      const eligible = wantsAttack.current && !isBusy(runtime) && canClaimAttackSlot(slotTimer.current) && transitionLeft.current === 0
      const attacks = currentAttacks()
      const cooldowns = cooldownsNow()
      const choice = eligible ? pickAttack(attacks, attackAt.current, cooldowns.current, random) : null
      if (choice === null) {
        if (!ownSlot) store.cancelAttackRequest(id)
        return
      }
      if (ownSlot || store.requestAttackToken(id)) {
        startCooldown(cooldowns.current, attacks, choice)
        startAttackSlotHold(slotTimer.current, E)
        startMove(runtime.move, attacks[choice].move)
        runtime.weaponMove = attacks !== stats.attacks
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
        color={stats.color}
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
