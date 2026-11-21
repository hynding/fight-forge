import type { RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimSystem } from '../sim/simContext'
import { boxesOverlap } from '../sim/combat'
import { movePhase } from '../sim/moves'
import { applyHit, isInvulnerable } from '../sim/reactions'
import { isDodging } from '../sim/defense'
import { actionEnabled } from '../sim/input'
import { canBeGrabbed, endGrab, holdPosition, inGrabRange, startGrab, stepContact, stillFlying, throwLaunch } from '../sim/grab'
import type { FighterRuntime } from '../sim/fighter'
import { feelHit } from '../sim/feel'
import { playSound } from '../audio/engine'
import { hurtEnemy } from './enemyDamage'
import { poiseHit } from '../sim/boss'

const PLAYER = 'player'

interface GrabSystemProps {
  playerRef: RefObject<RapierRigidBody>
  runtimes: Map<string, FighterRuntime>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}

/**
 * The `grab` sim system (after the fighters move, before the camera): the
 * player grabs a free or stunned enemy by walking into it (`contact`) or
 * pressing grab beside it (`button`), when the pack's moveset has `grabbing`
 * rows. The held enemy is pinned in front of the player until it breaks free,
 * the player is hit, or a throw move's active frames launch it, knocked down;
 * a thrown enemy knocks down the other enemies it flies into.
 */
export const GrabSystem = ({ playerRef, runtimes, enemyRefs }: GrabSystemProps) => {
  const feel = useFeel()

  useSimSystem('grab', SYSTEM_ORDER.grab, (dt) => {
    const config = getConfig()
    const cfg = config.actions.grab
    const player = runtimes.get(PLAYER)
    const playerBody = playerRef.current
    if (!player || !playerBody) return
    const p = playerBody.translation()
    const grab = player.grab
    grab.cooldownLeft = Math.max(0, grab.cooldownLeft - dt)
    const enemyBody = (id: string) => enemyRefs.get(id)?.current ?? null

    if (grab.target !== null) {
      const target = runtimes.get(grab.target)
      const body = enemyBody(grab.target)
      if (!target || !body || target.reaction.kind !== 'held') {
        // Broke free (or knocked out of the grab): push the two apart.
        if (target && body && target.reaction.kind === null) {
          const dir = Math.sign(body.translation().x - p.x) || player.facing.x
          target.velocity = { x: dir * cfg.releasePush, z: 0 }
          body.setLinvel({ x: dir * cfg.releasePush, y: body.linvel().y, z: 0 }, true)
        }
        endGrab(player, cfg)
      } else if (player.reaction.kind !== null) {
        // Hit while holding: let go.
        target.reaction.kind = null
        target.reaction.timeLeft = 0
        endGrab(player, cfg)
      } else {
        const moveName = player.move.move
        const move = moveName ? config.moves[moveName] : null
        if (move?.throw && movePhase(move, player.move.time) === 'active' && grab.thrownInstance !== player.move.instance) {
          grab.thrownInstance = player.move.instance
          const launch = throwLaunch(move.throw, player.facing.x)
          // Over the shoulder: the enemy goes behind the thrower first.
          const at = holdPosition(p, player, target, launch.dirX === player.facing.x ? 1 : -1)
          const b = body.translation()
          body.setTranslation({ x: at.x, y: b.y, z: at.z }, true)
          target.reaction.kind = 'knockdown'
          target.reaction.timeLeft = config.reactions.knockdownDuration
          target.velocity = { x: launch.x, z: 0 }
          body.setLinvel({ x: launch.x, y: launch.y, z: 0 }, true)
          target.thrown = { by: PLAYER, damage: move.throw.hitDamage, dirX: launch.dirX, hit: new Set([grab.target]) }
          playSound(move.hitSound ?? config.audio.hit)
          feelHit(feel, config.feel, {
            at: { x: at.x, y: b.y, z: at.z + 0.3 },
            feet: { x: at.x, y: b.y - target.hurtbox.y, z: at.z },
            damage: move.throw.damage,
            guarded: false,
            toPlayer: false,
            down: true,
          })
          const thrownId = grab.target
          endGrab(player, cfg)
          if (move.throw.damage > 0) {
            useGameStore.getState().gainMeter(move.throw.damage * config.rules.meter.perDamageDealt)
            hurtEnemy(thrownId, move.throw.damage, at)
          }
        } else {
          // Pinned in front of the player, facing it.
          const at = holdPosition(p, player, target)
          const b = body.translation()
          body.setTranslation({ x: at.x, y: b.y, z: at.z }, true)
          body.setLinvel({ x: 0, y: b.y > p.y ? Math.min(0, body.linvel().y) : 0, z: 0 }, true)
          target.velocity = { x: 0, z: 0 }
          target.facing.x = -player.facing.x
        }
      }
    } else {
      // Try to grab: free, on the ground, not guarding, and the pack has moves for it.
      const actions = config.input.actions
      const usable = actions.grab.enabled && config.player.moveset.some((t) => t.when === 'grabbing')
      const free = player.move.move === null && player.reaction.kind === null && !isDodging(player.dodge) && player.grounded && !player.blocking
      const intent = player.intent
      let candidate: string | null = null
      if (usable && free && grab.cooldownLeft <= 0) {
        const self = { x: p.x, z: p.z }
        let best = Infinity
        runtimes.forEach((rt, id) => {
          if (id === PLAYER) return
          const body = enemyBody(id)
          const enemy = useGameStore.getState().enemies.find((e) => e.id === id)
          if (!body || !enemy || config.enemyTypes[enemy.type]?.grabbable === false || !canBeGrabbed(rt)) return
          const t = body.translation()
          if (!inGrabRange(self, player, { x: t.x, z: t.z }, rt, cfg)) return
          const d = Math.abs(t.x - p.x)
          if (d < best) {
            best = d
            candidate = id
          }
        })
      }
      const contact = actions.grab.trigger === 'contact'
      const pushing = !!candidate && !!intent && intent.move.x * player.facing.x > 0.5
      const ready = contact ? stepContact(grab, pushing, dt, cfg) : !!intent?.grab && actionEnabled(actions, 'grab') && !!candidate
      if (!candidate) grab.contact = 0
      if (ready && candidate) {
        const target = runtimes.get(candidate)
        if (target) startGrab(player, target, candidate, cfg)
      }
    }

    // Thrown enemies knock down the others they fly into.
    runtimes.forEach((thrown, id) => {
      if (!thrown.thrown) return
      const body = enemyBody(id)
      if (!body || !stillFlying(thrown)) {
        thrown.thrown = null
        return
      }
      const a = body.translation()
      const flight = thrown.thrown
      runtimes.forEach((other, otherId) => {
        if (otherId === PLAYER || otherId === id || flight.hit.has(otherId)) return
        const ob = enemyBody(otherId)
        if (!ob || other.reaction.kind === 'held' || isInvulnerable(other.reaction) || isDodging(other.dodge)) return
        const t = ob.translation()
        // A flying body sweeps a little depth either side, like the grab's own reach.
        const half = { ...thrown.hurtbox, z: thrown.hurtbox.z + cfg.depthTolerance }
        if (!boxesOverlap({ center: a, half }, { center: t, half: other.hurtbox })) return
        flight.hit.add(otherId)
        const knock = { hitstun: 0, knockback: { x: 0, y: 0 }, knockdown: true }
        // A boss's poise can shrug off the knockdown.
        const reaction = other.poise ? poiseHit(other.poise.state, other.poise.config, knock) : knock
        if (reaction.knockdown) {
          applyHit(other.reaction, reaction, config.reactions)
          const kb = Math.abs(thrown.velocity.x) * 0.6
          other.velocity = { x: flight.dirX * kb, z: 0 }
          ob.setLinvel({ x: flight.dirX * kb, y: 3, z: 0 }, true)
        }
        playSound(config.audio.hit)
        feelHit(feel, config.feel, {
          at: { x: (a.x + t.x) / 2, y: t.y, z: t.z + 0.3 },
          feet: { x: t.x, y: t.y - other.hurtbox.y, z: t.z },
          damage: flight.damage,
          guarded: false,
          toPlayer: false,
          down: !!reaction.knockdown,
        })
        if (flight.damage > 0) {
          useGameStore.getState().gainMeter(flight.damage * config.rules.meter.perDamageDealt)
          hurtEnemy(otherId, flight.damage, t)
        }
      })
    })
  })

  return null
}
