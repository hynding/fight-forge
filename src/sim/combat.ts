// Pure hit-detection math for the combat system: an attacker's hitbox against
// a target's hurtbox, as axis-aligned boxes (fighters face only left or right).

import type { Hitbox } from './moves'

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface Box {
  center: Vec3Like
  half: Vec3Like
}

/** The hitbox in world space for an attacker at `pos` facing `facingX` (±1), scaled by `scale`. */
export const hitboxWorld = (pos: Vec3Like, facingX: number, hb: Hitbox, scale: number): Box => ({
  center: { x: pos.x + facingX * hb.forward * scale, y: pos.y + hb.up * scale, z: pos.z },
  half: { x: hb.halfX * scale, y: hb.halfY * scale, z: hb.halfZ * scale },
})

export const boxesOverlap = (a: Box, b: Box): boolean =>
  Math.abs(a.center.x - b.center.x) < a.half.x + b.half.x &&
  Math.abs(a.center.y - b.center.y) < a.half.y + b.half.y &&
  Math.abs(a.center.z - b.center.z) < a.half.z + b.half.z

/** Knockback direction along X: away from the attacker, or along its facing when level. */
export const knockbackDirection = (attackerX: number, targetX: number, facingX: number): number => {
  const d = targetX - attackerX
  return Math.abs(d) > 1e-6 ? Math.sign(d) : facingX
}
