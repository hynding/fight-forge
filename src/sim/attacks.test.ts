import { describe, expect, it } from 'vitest'
import { attackChances, attacksOf, farAttackReady, pickAttack, seededRandom, startCooldown, stepCooldowns, type AttackDef } from './attacks'

const attacks: AttackDef[] = [
  { move: 'swipe', range: 'near', weight: 3 },
  { move: 'charge', range: 'far', weight: 1, cooldown: 4 },
  { move: 'stomp', range: 'any' },
]

describe('attack patterns', () => {
  it('falls back to attackMove, then the default move, as one attack for any range', () => {
    expect(attacksOf({}, 'punch')).toEqual([{ move: 'punch', range: 'any' }])
    expect(attacksOf({ attackMove: 'rushPunch' }, 'punch')).toEqual([{ move: 'rushPunch', range: 'any' }])
    expect(attacksOf({ attacks, attackMove: 'rushPunch' }, 'punch')).toBe(attacks)
  })

  it('picks only attacks that fit the range, by weight', () => {
    // Near: swipe (3) and stomp (1); a roll in the first 3/4 is the swipe.
    expect(pickAttack(attacks, 'near', [], () => 0.7)).toBe(0)
    expect(pickAttack(attacks, 'near', [], () => 0.8)).toBe(2)
    // Far: charge (1) and stomp (1).
    expect(pickAttack(attacks, 'far', [], () => 0.2)).toBe(1)
    expect(pickAttack(attacks, 'far', [], () => 0.9)).toBe(2)
  })

  it('skips attacks on cooldown until it runs out', () => {
    const cd: number[] = []
    startCooldown(cd, attacks, 1)
    expect(farAttackReady(attacks, cd)).toBe(false)
    expect(pickAttack(attacks, 'far', cd, () => 0)).toBe(2)
    stepCooldowns(cd, 3.9)
    expect(farAttackReady(attacks, cd)).toBe(false)
    stepCooldowns(cd, 0.1)
    expect(farAttackReady(attacks, cd)).toBe(true)
  })

  it('returns null when nothing fits', () => {
    expect(pickAttack([{ move: 'charge', range: 'far' }], 'near', [], Math.random)).toBe(null)
    expect(pickAttack([{ move: 'swipe', range: 'near', weight: 0 }], 'near', [], Math.random)).toBe(null)
  })

  it('uses every attack over many picks with a seeded random', () => {
    const random = seededRandom('enemy-1')
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) {
      seen.add(pickAttack(attacks, 'near', [], random)!)
      seen.add(pickAttack(attacks, 'far', [], random)!)
    }
    expect([...seen].sort()).toEqual([0, 1, 2])
  })

  it('is deterministic per seed', () => {
    const a = seededRandom('boss')
    const b = seededRandom('boss')
    const c = seededRandom('other')
    const run = (r: () => number) => Array.from({ length: 5 }, r)
    const ra = run(a)
    expect(run(b)).toEqual(ra)
    expect(run(c)).not.toEqual(ra)
    for (const v of ra) expect(v >= 0 && v < 1).toBe(true)
  })

  it('shows each attack\'s chance at near and far range', () => {
    expect(attackChances(attacks, 'near')).toEqual([0.75, 0, 0.25])
    expect(attackChances(attacks, 'far')).toEqual([0, 0.5, 0.5])
  })
})
