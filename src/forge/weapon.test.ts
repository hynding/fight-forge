import { describe, expect, it } from 'vitest'
import { buildRegistry } from '../content/registry'
import { defaultPack } from '../content/defaultPack'
import { SCHEMA_VERSION } from '../content/schemas'
import { addWeaponPickup, setThrow, throwProjectile, TRY_WEAPON, tryProjectilePack, weaponPickups, weaponSandboxLevel, weaponSummary } from './weapon'
import type { WeaponDef } from '../sim/weapons'
import type { PackJson } from './workspace'

const pack = (extra: PackJson = {}): PackJson => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'mine',
  name: 'Mine',
  version: '1.0.0',
  meta: { author: 't', description: '', license: 'CC0-1.0' },
  ...extra,
})
const valid = (json: PackJson) => {
  const r = buildRegistry([defaultPack(), json])
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.value
}
const bat = { name: 'Bat', kind: 'melee', model: { shape: 'cylinder', size: [0.1, 0.9, 0.1], color: '#aa7744' }, hold: 'hand', moveset: [{ action: 'attack', move: 'jab' }] }

describe('weapon pickups', () => {
  it('lists the pickups that drop a weapon, and adds one in its colour', () => {
    expect(weaponPickups(pack(), 'pipe')).toEqual(['pipe'])
    const json = pack({ weapons: { bat } })
    expect(weaponPickups(json, 'bat')).toEqual([])
    const r = addWeaponPickup(json, 'bat')
    expect(r.pickup).toBe('bat')
    expect(weaponPickups(r.json, 'bat')).toEqual(['bat'])
    expect(valid(r.json).pickups.bat).toMatchObject({ effect: 'weapon', weapon: 'bat', color: '#aa7744' })
    // A taken id gets a suffix.
    expect(addWeaponPickup(pack(), 'pipe').pickup).toBe('pipe-2')
  })
})

describe('setThrow', () => {
  it('makes a weapon throw a projectile through a new move, then changes that move in place', () => {
    let json = setThrow(pack({ weapons: { bat } }), 'bat', 'knife', false)
    const reg = valid(json)
    expect(reg.weapons.bat.throw).toEqual({ move: 'batToss' })
    expect(reg.moves.batToss.projectile).toEqual({ id: 'knife', from: [0.6, 0.3] })
    expect(throwProjectile(json, reg.weapons.bat as WeaponDef)).toBe('knife')
    json = setThrow(json, 'bat', 'pipeSpin', true)
    expect(valid(json).weapons.bat.throw).toEqual({ move: 'batToss', returns: true })
    expect(valid(json).moves.batToss.projectile?.id).toBe('pipeSpin')
    expect(valid(setThrow(json, 'bat', null, false)).weapons.bat.throw).toBeUndefined()
  })

  it("copies a default weapon's throw move into the pack instead of changing the default's", () => {
    const json = setThrow(pack(), 'knife', 'barrel', false)
    const reg = valid(json)
    expect(reg.weapons.knife.throw?.move).toBe('knifeToss-2')
    expect(reg.moves['knifeToss-2'].projectile?.id).toBe('barrel')
    expect(reg.moves.knifeToss.projectile?.id).toBe('knife')
  })
})

describe('sandboxes', () => {
  it('lends the player a weapon that fires a projectile on attack', () => {
    const reg = valid(tryProjectilePack(pack(), 'barrel', [0.5, 1]))
    const w = reg.weapons[TRY_WEAPON]
    expect(w.durability).toBeUndefined()
    expect(reg.moves[w.moveset[0].move].projectile).toEqual({ id: 'barrel', from: [0.5, 1] })
  })

  it('fights a few plain enemies', () => {
    const level = weaponSandboxLevel()
    expect(level.segments[0].triggers[0]).toMatchObject({ kind: 'wave', lock: true })
  })

  it('describes a weapon in a line', () => {
    expect(weaponSummary(valid(pack()).weapons.pipe as WeaponDef)).toBe('in the hand · breaks after 12 hits · 3 moves · thrown, lands again')
    expect(weaponSummary(valid(pack()).weapons.barrel as WeaponDef)).toBe('heavy, held overhead · never breaks · 0 moves · thrown, gone')
  })
})
