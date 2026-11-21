// The Forge's weapon helpers: the pickups that put a weapon on the floor, a
// pickup for one that has none, the throw (a move that fires a projectile),
// and the sandboxes that fight with a weapon or try a projectile. Pure.

import { getIn, setIn } from './paths'
import { sandboxLevel } from './sandbox'
import { baseContent, uniqueId, type PackJson } from './workspace'
import type { Level } from '../sim/level'
import type { WeaponDef } from '../sim/weapons'
import { DEFAULT_FROM } from './projectile'

type Json = Record<string, unknown>

/** The enemy type the weapon sandboxes put in front of the player. */
export const SANDBOX_FOE = 'BASIC'
/** How many of them. */
export const SANDBOX_FOES = 3

/** Ids of a record group, the pack's over the default pack's. */
const merged = (json: PackJson, group: 'moves' | 'pickups' | 'weapons' | 'projectiles'): Record<string, Json> => ({
  ...(baseContent()[group] as Record<string, Json>),
  ...((getIn(json, [group]) ?? {}) as Record<string, Json>),
})

/** The pickups that put weapon `id` on the floor. */
export const weaponPickups = (json: PackJson, id: string): string[] =>
  Object.entries(merged(json, 'pickups')).flatMap(([pid, p]) => (p.effect === 'weapon' && p.weapon === id ? [pid] : []))

/** Adds a pickup for weapon `id` (in its colour) so levels, props and enemies can drop it. Returns the new pickup's id. */
export const addWeaponPickup = (json: PackJson, id: string): { json: PackJson; pickup: string } => {
  const weapon = merged(json, 'weapons')[id] as unknown as WeaponDef | undefined
  const pickup = uniqueId(id, Object.keys(merged(json, 'pickups')))
  const def = { effect: 'weapon', amount: 0, color: weapon?.model.color ?? '#c0c8d0', size: 0.3, weapon: id }
  return { json: setIn(json, ['pickups', pickup], def) as PackJson, pickup }
}

/** The projectile a weapon's throw fires, if its throw move fires one. */
export const throwProjectile = (json: PackJson, weapon: WeaponDef): string | undefined => {
  if (!weapon.throw) return undefined
  const move = merged(json, 'moves')[weapon.throw.move] as { projectile?: { id: string } } | undefined
  return move?.projectile?.id
}

/** A throw move's timing when the Forge makes one: quick, like the knife toss. */
const TOSS = {
  sound: 'whoosh',
  startup: 0.12,
  active: 0.1,
  recovery: 0.3,
  damage: 0,
  hitbox: { forward: 0.6, up: 0.3, halfX: 0.2, halfY: 0.2, halfZ: 0.2 },
  reaction: { hitstun: 0, knockback: { x: 0, y: 0 } },
}

/**
 * Makes weapon `id` throw `projectile` (or not, with null): its throw move
 * fires it. A throw move the pack already owns for this weapon is changed in
 * place; otherwise a `<id>Toss` move is added.
 */
export const setThrow = (json: PackJson, id: string, projectile: string | null, returns: boolean): PackJson => {
  const weapon = merged(json, 'weapons')[id] as unknown as WeaponDef
  if (projectile === null) {
    const { throw: _t, ...rest } = weapon
    void _t
    return setIn(json, ['weapons', id], rest) as PackJson
  }
  const ownMoves = (getIn(json, ['moves']) ?? {}) as Record<string, Json>
  const current = weapon.throw?.move
  const move = current && ownMoves[current] ? current : uniqueId(`${id}Toss`, Object.keys(merged(json, 'moves')))
  const base = (ownMoves[move] ?? merged(json, 'moves')[current ?? ''] ?? TOSS) as Json
  const from = (base.projectile as { from?: [number, number] } | undefined)?.from ?? DEFAULT_FROM
  let next = setIn(json, ['moves', move], { ...base, projectile: { id: projectile, from } }) as PackJson
  next = setIn(next, ['weapons', id], { ...weapon, throw: { move, ...(returns ? { returns: true } : {}) } }) as PackJson
  return next
}

/** The id of the weapon the Forge's "▶ Try it" lends the player. */
export const TRY_WEAPON = 'forge-try'

/**
 * The pack with a weapon (and its move) that fires `projectile` on attack,
 * for the PROJECTILE card's "▶ Try it". It never breaks, and it's not saved.
 */
export const tryProjectilePack = (json: PackJson, projectile: string, from: [number, number]): PackJson => {
  const move = uniqueId('forgeTry', Object.keys(merged(json, 'moves')))
  let next = setIn(json, ['moves', move], { ...TOSS, recovery: 0.15, projectile: { id: projectile, from } }) as PackJson
  next = setIn(next, ['weapons', TRY_WEAPON], {
    name: `Try ${projectile}`,
    kind: 'melee',
    model: { shape: 'sphere', size: [0.15, 0.15, 0.15], color: '#ffd27a' },
    hold: 'hand',
    moveset: [{ action: 'attack', move }],
  }) as PackJson
  return next
}

/** The sandbox for a weapon: a few plain enemies in front of the player. */
export const weaponSandboxLevel = (): Level => sandboxLevel(SANDBOX_FOE, SANDBOX_FOES)

/** A one-line description of a weapon, for the card. */
export const weaponSummary = (w: WeaponDef): string =>
  [
    w.kind === 'heavy' ? 'heavy, held overhead' : `in the ${w.hold === 'overhead' ? 'arms, overhead' : 'hand'}`,
    w.durability ? `breaks after ${w.durability} hits` : 'never breaks',
    `${w.moveset.length} move${w.moveset.length === 1 ? '' : 's'}`,
    w.throw ? (w.throw.returns ? 'thrown, lands again' : 'thrown, gone') : 'not thrown',
  ].join(' · ')
