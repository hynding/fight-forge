import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimSystem } from '../sim/simContext'
import { boxesOverlap, hitboxWorld, knockbackDirection } from '../sim/combat'
import { interruptMove, movePhase } from '../sim/moves'
import { applyBlockstun, applyHit, isInvulnerable } from '../sim/reactions'
import { blockedHit, facesAttacker, isDodging } from '../sim/defense'
import { rollDrop } from '../sim/pickups'
import { combatTargets, scaledDamage } from '../sim/rules'
import { propBox } from '../sim/props'
import type { FighterRuntime } from '../sim/fighter'
import { playSound } from '../audio/engine'
import { feelHit } from '../sim/feel'

const PLAYER = 'player'

interface CombatSystemProps {
  playerRef: RefObject<RapierRigidBody>
  runtimes: Map<string, FighterRuntime>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
  playerPositionRef: RefObject<Vector3>
}

/**
 * The `combat` sim system: every fighter whose move is in its active frames
 * checks its hitbox against its targets' hurtboxes. The player hits enemies;
 * an enemy hits the player (and other enemies, with `rules.friendlyFire`)
 * only while it holds an attack token. A move
 * instance hits each target at most once. Knocked-down, getting-up and
 * dodging targets are invulnerable. A target guarding toward the attacker
 * blocks: chip damage, blockstun, a short push. The player's attacks also
 * break breakable props, which may drop a pickup. A target whose `armor` covers
 * the hit's hitstun takes the damage without flinching. Otherwise the hit deals damage,
 * applies the move's reaction (hitstun or knockdown) and knockback, and
 * interrupts the target's own move.
 */
export const CombatSystem = ({
  playerRef,
  runtimes,
  enemyRefs,
  playerPositionRef,
}: CombatSystemProps) => {
  // Targets already hit by each attacker's current move instance.
  const hits = useRef(new Map<string, { instance: number; targets: Set<string> }>())
  const feel = useFeel()

  // Every rendered frame (even paused): copy the player's position into the
  // shared ref so the camera and enemy AI read the latest value.
  useFrame(() => {
    if (!playerRef.current || !playerPositionRef.current) return
    const p = playerRef.current.translation()
    playerPositionRef.current.set(p.x, p.y, p.z)
  })

  useSimSystem('combat', SYSTEM_ORDER.combat, () => {
    const bodyOf = (name: string) =>
      name === PLAYER ? playerRef.current : (enemyRefs.get(name)?.current ?? null)

    // Forget attackers that no longer exist.
    hits.current.forEach((_, name) => {
      if (!runtimes.has(name)) hits.current.delete(name)
    })

    runtimes.forEach((attacker, attackerName) => {
      const moveName = attacker.move.move
      if (!moveName) return
      const move = getConfig().moves[moveName]
      if (movePhase(move, attacker.move.time) !== 'active') return

      // Read live store state; a render-time snapshot can lag the store by frames.
      const store = useGameStore.getState()
      // Attack tokens: only an enemy holding one may hurt the player.
      if (attackerName !== PLAYER && !store.attackTokens.holders.includes(attackerName)) return

      const attackerBody = bodyOf(attackerName)
      if (!attackerBody) return
      const a = attackerBody.translation()
      const hitbox = hitboxWorld(a, attacker.facing.x, move.hitbox, attacker.scale)

      let record = hits.current.get(attackerName)
      if (!record || record.instance !== attacker.move.instance) {
        record = { instance: attacker.move.instance, targets: new Set() }
        hits.current.set(attackerName, record)
        // The swing: once per move instance, as its active frames begin.
        playSound(move.sound)
      }

      const rules = getConfig().rules
      const targets = combatTargets(attackerName, PLAYER, enemyRefs.keys(), rules.friendlyFire)
      for (const targetName of targets) {
        if (record.targets.has(targetName)) continue
        const target = runtimes.get(targetName)
        const targetBody = bodyOf(targetName)
        if (!target || !targetBody) continue
        const t = targetBody.translation()
        if (!boxesOverlap(hitbox, { center: t, half: target.hurtbox })) continue

        record.targets.add(targetName)
        if (isInvulnerable(target.reaction) || isDodging(target.dodge)) continue

        const dir = knockbackDirection(a.x, t.x, attacker.facing.x)
        const v = targetBody.linvel()
        let damage = move.damage
        const audio = getConfig().audio
        const guarded = target.blocking && facesAttacker(target.facing.x, t.x, a.x)
        if (guarded) playSound(audio.block)
        else playSound(targetName === PLAYER ? (audio.hurt ?? move.hitSound ?? audio.hit) : (move.hitSound ?? audio.hit))
        if (guarded) {
          const blocked = blockedHit(move, getConfig().actions.block)
          damage = blocked.damage
          applyBlockstun(target.reaction, blocked.blockstun)
          target.velocity = { x: dir * blocked.knockbackX, z: 0 }
          targetBody.setLinvel({ x: dir * blocked.knockbackX, y: v.y, z: 0 }, true)
          interruptMove(target.move)
        } else if (move.reaction.knockdown || move.reaction.hitstun > target.armor) {
          applyHit(target.reaction, move.reaction, getConfig().reactions)
          const kb = move.reaction.knockback
          target.velocity = { x: dir * kb.x, z: 0 }
          targetBody.setLinvel({ x: dir * kb.x, y: kb.y > 0 ? kb.y : v.y, z: 0 }, true)
          interruptMove(target.move)
        }
        // Otherwise super armor: the target takes the damage without flinching.

        // Hit-stop, shake, sparks, dust and the damage number.
        const shown = targetName === PLAYER ? scaledDamage(damage, rules.difficulty.damageTaken) : damage
        const enemy = targetName === PLAYER ? undefined : store.enemies.find((e) => e.id === targetName)
        const knockedOut = !!enemy && enemy.health - damage <= 0
        feelHit(feel, getConfig().feel, {
          at: { x: (hitbox.center.x + t.x) / 2, y: hitbox.center.y, z: t.z + 0.3 },
          feet: { x: t.x, y: t.y - target.hurtbox.y, z: t.z },
          damage: shown,
          guarded,
          toPlayer: targetName === PLAYER,
          down: (!guarded && !!move.reaction.knockdown) || knockedOut,
        })

        if (damage <= 0) continue
        if (targetName === PLAYER) {
          if (shown > 0) store.damagePlayer(shown)
        } else {
          store.damageEnemy(targetName, damage)
          const defeated = !!enemy && !useGameStore.getState().enemies.some((e) => e.id === targetName)
          if (defeated) playSound(audio.ko)
          // Defeated: maybe drop a pickup where it fell.
          const dropped = defeated ? rollDrop(getConfig().enemyTypes[enemy.type].drop) : null
          if (dropped) {
            useGameStore
              .getState()
              .spawnPickup({ id: `drop-${targetName}`, pickup: dropped, x: t.x, z: t.z })
          }
        }
      }

      // The player's attacks also break breakable props (once per move instance).
      if (attackerName === PLAYER) {
        const config = getConfig()
        const floorTop = config.stage.floorThickness / 2
        for (const prop of useGameStore.getState().props) {
          const def = config.props[prop.prop]
          if (!def?.breakable || record.targets.has(prop.id)) continue
          if (!boxesOverlap(hitbox, propBox(prop, def, floorTop))) continue
          record.targets.add(prop.id)
          playSound(move.hitSound ?? config.audio.hit)
          if (!useGameStore.getState().damageProp(prop.id, move.damage)) continue
          const dropped = rollDrop(def.breakable.drop)
          if (dropped) useGameStore.getState().spawnPickup({ id: `drop-${prop.id}`, pickup: dropped, x: prop.x, z: prop.z })
        }
      }
    })
  })

  return null
}
