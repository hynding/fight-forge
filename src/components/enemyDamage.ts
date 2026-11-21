// Damage to an enemy from anything the player does (a hit, a throw, a thrown
// enemy): the store update, the KO sound, and a drop where it fell.

import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { rollDrop } from '../sim/pickups'
import { playSound } from '../audio/engine'

/** Deals `damage` to enemy `id` standing at `at`; returns whether it was defeated. */
export const hurtEnemy = (id: string, damage: number, at: { x: number; z: number }): boolean => {
  const store = useGameStore.getState()
  const enemy = store.enemies.find((e) => e.id === id)
  if (!enemy || damage <= 0) return false
  store.damageEnemy(id, damage)
  const defeated = !useGameStore.getState().enemies.some((e) => e.id === id)
  if (!defeated) return false
  playSound(getConfig().audio.ko)
  const dropped = rollDrop(getConfig().enemyTypes[enemy.type].drop)
  if (dropped) useGameStore.getState().spawnPickup({ id: `drop-${id}`, pickup: dropped, x: at.x, z: at.z })
  return true
}
