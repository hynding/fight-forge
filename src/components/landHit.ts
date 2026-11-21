// One hit landing on a fighter, from a move's hitbox (CombatSystem) or a
// projectile (ProjectileSystem): guard, poise, armor, the reaction and
// knockback, sound, feel, rumble, meter, and the damage itself.

import type { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { interruptMove, type HitReaction } from '../sim/moves'
import { applyBlockstun, applyHit } from '../sim/reactions'
import { blockedHit, facesAttacker } from '../sim/defense'
import { poiseHit } from '../sim/boss'
import { scaledDamage } from '../sim/rules'
import type { FighterRuntime } from '../sim/fighter'
import { playSound } from '../audio/engine'
import { feelHit, rumbleFor, type FeelState } from '../sim/feel'
import { rumble } from '../input/gamepads'
import { hurtEnemy } from './enemyDamage'
import { propBox } from '../sim/props'
import { rollDrop } from '../sim/pickups'
import { boxesOverlap, type Box } from '../sim/combat'

export const PLAYER = 'player'

export interface LandedHit {
  /** Who it's from (`player` or an enemy id), for meter and rumble. */
  attacker: string
  target: string
  targetRuntime: FighterRuntime
  targetBody: RapierRigidBody
  /** Where the hit comes from along X: a target facing it can guard. */
  fromX: number
  /** Knockback direction along X (±1). */
  dirX: number
  damage: number
  reaction: HitReaction
  hitSound?: string
  /** Where the sparks go. */
  at: { x: number; y: number }
}

/**
 * Applies a hit that already passed the overlap, invulnerability and dodge
 * checks. A target guarding toward `fromX` blocks: chip damage, blockstun, a
 * short push. Otherwise a boss's poise may soften a knockdown, and armor that
 * covers the hitstun takes the damage without flinching.
 */
export const landHit = (feel: FeelState, h: LandedHit): void => {
  const { target: targetName, targetRuntime: target, targetBody } = h
  const config = getConfig()
  const store = useGameStore.getState()
  const t = targetBody.translation()
  const v = targetBody.linvel()
  let damage = h.damage
  let reaction = h.reaction
  const audio = config.audio
  const toPlayer = targetName === PLAYER
  const guarded = target.blocking && facesAttacker(target.facing.x, t.x, h.fromX)
  if (guarded) playSound(audio.block)
  else playSound(toPlayer ? (audio.hurt ?? h.hitSound ?? audio.hit) : (h.hitSound ?? audio.hit))
  if (guarded) {
    const blocked = blockedHit(h, config.actions.block)
    damage = blocked.damage
    applyBlockstun(target.reaction, blocked.blockstun)
    target.velocity = { x: h.dirX * blocked.knockbackX, z: 0 }
    targetBody.setLinvel({ x: h.dirX * blocked.knockbackX, y: v.y, z: 0 }, true)
    interruptMove(target.move)
  } else {
    // A boss's poise turns early knockdowns into staggers.
    reaction = target.poise ? poiseHit(target.poise.state, target.poise.config, h.reaction) : h.reaction
    if (reaction.knockdown || reaction.hitstun > target.armor) {
      applyHit(target.reaction, reaction, config.reactions)
      const kb = reaction.knockback
      target.velocity = { x: h.dirX * kb.x, z: 0 }
      targetBody.setLinvel({ x: h.dirX * kb.x, y: kb.y > 0 ? kb.y : v.y, z: 0 }, true)
      interruptMove(target.move)
    }
    // Otherwise super armor: the target takes the damage without flinching.
  }

  // Hit-stop, shake, sparks, dust and the damage number.
  const rules = config.rules
  const shown = toPlayer ? scaledDamage(damage, rules.difficulty.damageTaken) : damage
  const enemy = toPlayer ? undefined : store.enemies.find((e) => e.id === targetName)
  const knockedOut = !!enemy && enemy.health - damage <= 0
  feelHit(feel, config.feel, {
    at: { x: (h.at.x + t.x) / 2, y: h.at.y, z: t.z + 0.3 },
    feet: { x: t.x, y: t.y - target.hurtbox.y, z: t.z },
    damage: shown,
    guarded,
    toPlayer,
    down: (!guarded && !!reaction.knockdown) || knockedOut,
  })
  rumble(
    rumbleFor(config.feel, { damage: shown, toPlayer, byPlayer: h.attacker === PLAYER, ko: knockedOut }),
    config.feel.rumble.duration
  )

  if (damage <= 0) return
  // The special meter fills from hits the player lands and takes.
  const meter = rules.meter
  if (h.attacker === PLAYER) store.gainMeter(damage * meter.perDamageDealt)
  if (toPlayer) {
    store.gainMeter(shown * meter.perDamageTaken)
    if (shown > 0) store.damagePlayer(shown)
  } else {
    hurtEnemy(targetName, damage, t)
  }
}

/**
 * The player's hits break breakable props: each prop overlapping `box` that
 * isn't in `hit` yet takes `damage` (and may drop a pickup when it breaks).
 * Returns how many it hit.
 */
export const hitProps = (box: Box, hit: Set<string>, damage: number, hitSound?: string): number => {
  let count = 0
  const config = getConfig()
  const floorTop = config.stage.floorThickness / 2
  for (const prop of useGameStore.getState().props) {
    const def = config.props[prop.prop]
    if (!def?.breakable || hit.has(prop.id)) continue
    if (!boxesOverlap(box, propBox(prop, def, floorTop))) continue
    hit.add(prop.id)
    count++
    playSound(hitSound ?? config.audio.hit)
    if (!useGameStore.getState().damageProp(prop.id, damage)) continue
    const dropped = rollDrop(def.breakable.drop)
    if (dropped) useGameStore.getState().spawnPickup({ id: `drop-${prop.id}`, pickup: dropped, x: prop.x, z: prop.z })
  }
  return count
}
