import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimSystem } from '../sim/simContext'
import { boxesOverlap, hitboxWorld, knockbackDirection } from '../sim/combat'
import { movePhase } from '../sim/moves'
import { isInvulnerable } from '../sim/reactions'
import { isDodging } from '../sim/defense'
import { hitProps, landHit, PLAYER } from './landHit'
import { combatTargets } from '../sim/rules'
import { wearWeapon } from '../sim/weapons'
import { breakWeapon } from './weaponDrops'
import type { FighterRuntime } from '../sim/fighter'
import { playSound } from '../audio/engine'

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
      // A throw's effect is the throw (GrabSystem), a projectile's the projectile
      // (ProjectileSystem); their hitboxes hit nothing.
      if (move.throw || move.projectile) return

      // Read live store state; a render-time snapshot can lag the store by frames.
      const store = useGameStore.getState()
      // Attack tokens: only an enemy holding one (or with its own slot, a boss) may hurt the player.
      if (attackerName !== PLAYER && !attacker.ownAttackSlot && !store.attackTokens.holders.includes(attackerName)) return

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

        landHit(feel, {
          attacker: attackerName,
          target: targetName,
          targetRuntime: target,
          targetBody,
          fromX: a.x,
          dirX: knockbackDirection(a.x, t.x, attacker.facing.x),
          damage: move.damage,
          reaction: move.reaction,
          hitSound: move.hitSound,
          at: { x: hitbox.center.x, y: hitbox.center.y },
        })
        // Each hit a weapon's move lands wears it down.
        if (attacker.weapon && attacker.weaponMove && wearWeapon(attacker.weapon)) breakWeapon(attacker, feel, hitbox.center)
      }

      // The player's attacks also break breakable props (once per move instance).
      if (attackerName === PLAYER) hitProps(hitbox, record.targets, move.damage, move.hitSound)
    })
  })

  return null
}
