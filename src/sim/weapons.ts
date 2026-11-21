// Weapons: items a fighter picks up and fights with. While held, a weapon's
// moveset rows are tried before the fighter's own (a `heavy` weapon, lifted
// overhead, replaces them); each hit its moves land wears it down until it
// breaks; a knockdown drops it; the grab button throws it (a move that fires
// a projectile). Pure TS; Player, Enemy and the combat systems use it.

import type { AttackDef } from './attacks'
import type { Moveset, MoveTrigger } from './moveset'
import type { PickupDef, PickupInstance } from './pickups'
import type { PropDef, PropInstance } from './props'
import type { ProjectileShape } from './projectiles'

/** A plain shape for a weapon, in hand or on the floor. */
export interface WeaponModel {
  shape: ProjectileShape
  /** Width, length (the long side, up the hand), depth; a cylinder's or sphere's diameter is the first. */
  size: [number, number, number]
  color: string
}

export interface WeaponDef {
  /** Shown on the HUD. */
  name: string
  /** `melee` adds moves; `heavy` (a barrel overhead) replaces them and slows walking. */
  kind: 'melee' | 'heavy'
  model: WeaponModel
  /** In the hand, or held overhead with both. */
  hold: 'hand' | 'overhead'
  /** Hits its moves land before it breaks; without it, it never breaks. */
  durability?: number
  /** Rows tried before the fighter's own moveset while it's held. */
  moveset: MoveTrigger[]
  /** The grab button throws it with this move (which fires a projectile); `returns` lands it as a pickup again. */
  throw?: { move: string; returns?: boolean }
  /** Walking speed while held (default 1; a heavy weapon defaults to 0.6). */
  walkFactor?: number
}

/** A weapon in a fighter's hands. */
export interface HeldWeapon {
  id: string
  /** Hits left, or null when it never breaks. */
  durability: number | null
}

/** A freshly picked up (or starting) weapon, with its durability, or what was left of it. */
export const holdWeapon = (id: string, def: WeaponDef, durability?: number): HeldWeapon => ({
  id,
  durability: durability ?? def.durability ?? null,
})

/** How fast the holder walks. */
export const walkFactor = (def: WeaponDef | undefined): number => (def ? (def.walkFactor ?? (def.kind === 'heavy' ? 0.6 : 1)) : 1)

/** The rows tried while holding `def`: its rows, then the fighter's own (none for a heavy weapon). */
export const weaponMoveset = (def: WeaponDef | undefined, own: Moveset): Moveset =>
  !def ? own : def.kind === 'heavy' ? def.moveset : [...def.moveset, ...own]

/** One hit landed with the weapon: returns true when it breaks. */
export const wearWeapon = (held: HeldWeapon): boolean => {
  if (held.durability === null) return false
  held.durability = Math.max(0, held.durability - 1)
  return held.durability === 0
}

/**
 * An armed enemy's attacks: the moves of the weapon's plain attack and heavy
 * rows (on the ground), all at near range. Null when it has none, so the
 * enemy keeps its own attacks (and still carries the weapon).
 */
export const armedAttacks = (def: WeaponDef): AttackDef[] | null => {
  const moves = new Set<string>()
  for (const t of def.moveset)
    if ((t.when ?? 'ground') === 'ground' && !t.direction && !t.cost && (t.action === 'attack' || t.action === 'heavy')) moves.add(t.move)
  return moves.size ? [...moves].map((move) => ({ move, range: 'near' as const })) : null
}

/** The pickup that puts weapon `id` on the floor (the first with `effect: "weapon"` naming it), or null. */
export const weaponPickupFor = (pickups: Record<string, PickupDef>, id: string): string | null =>
  Object.entries(pickups).find(([, p]) => p.effect === 'weapon' && p.weapon === id)?.[0] ?? null

/** The nearest weapon on the floor within `radius` of `at`, or null. */
export const weaponInReach = (
  items: readonly PickupInstance[],
  pickups: Record<string, PickupDef>,
  at: { x: number; z: number },
  radius: number
): PickupInstance | null => {
  let best: PickupInstance | null = null
  let bestD = Infinity
  for (const item of items) {
    if (pickups[item.pickup]?.effect !== 'weapon') continue
    const d = Math.hypot(item.x - at.x, item.z - at.z)
    if (d <= radius && d < bestD) {
      best = item
      bestD = d
    }
  }
  return best
}

/**
 * A liftable prop in front of the fighter: on the side it faces, its near edge
 * within `range` of the fighter's, and within `depth` in Z. The nearest wins.
 */
export const liftableInReach = (
  props: readonly PropInstance[],
  defs: Record<string, PropDef>,
  at: { x: number; z: number },
  facingX: number,
  halfWidth: number,
  range: number,
  depth: number
): PropInstance | null => {
  let best: PropInstance | null = null
  let bestD = Infinity
  for (const p of props) {
    const def = defs[p.prop]
    if (!def?.liftable) continue
    const dx = p.x - at.x
    if (Math.sign(dx) !== Math.sign(facingX) && Math.abs(dx) > 1e-6) continue
    const gap = Math.abs(dx) - halfWidth - def.size[0] / 2
    if (gap > range || Math.abs(p.z - at.z) > depth) continue
    if (Math.abs(dx) < bestD) {
      best = p
      bestD = Math.abs(dx)
    }
  }
  return best
}
