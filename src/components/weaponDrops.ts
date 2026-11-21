// A weapon leaving a fighter's hands: dropped at its feet (a knockdown, or
// put down on purpose), landing after a throw, or breaking.

import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { weaponPickupFor, type HeldWeapon } from '../sim/weapons'
import type { FighterRuntime } from '../sim/fighter'
import { feelHit, type FeelState } from '../sim/feel'
import { playSound } from '../audio/engine'

let nextDrop = 1

/** Puts `weapon` on the floor at `at` as its pickup (a weapon with no pickup, a lifted barrel, is gone). */
export const placeWeapon = (weapon: HeldWeapon, at: { x: number; z: number }): void => {
  const pickup = weaponPickupFor(getConfig().pickups, weapon.id)
  if (!pickup) return
  useGameStore.getState().spawnPickup({
    id: `weapon-${nextDrop++}`,
    pickup,
    x: at.x,
    z: at.z,
    ...(weapon.durability !== null ? { durability: weapon.durability } : {}),
  })
}

/** The fighter lets go of its weapon, which lands at `at`. */
export const dropWeapon = (rt: FighterRuntime, at: { x: number; z: number }): void => {
  if (!rt.weapon) return
  placeWeapon(rt.weapon, at)
  rt.weapon = null
  rt.weaponMove = false
}

/** Its weapon broke: gone, with a crack, a puff of dust and a small shake. */
export const breakWeapon = (rt: FighterRuntime, feel: FeelState, at: { x: number; y: number; z: number }): void => {
  rt.weapon = null
  rt.weaponMove = false
  const config = getConfig()
  playSound(config.audio.break)
  feelHit(feel, { ...config.feel, damageNumbers: { ...config.feel.damageNumbers, enabled: false } }, {
    at,
    feet: { x: at.x, y: at.y - 0.3, z: at.z },
    damage: 4,
    guarded: false,
    toPlayer: false,
    down: true,
  })
}
