import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { createFeel, feelHit, hitStopFor, shakeFor, shakeOffset, sparkDirections, stepFeel, type FeelSettings } from './feel'

const S: FeelSettings = DEFAULT_CONFIG.feel
const off: FeelSettings = {
  hitStop: { ...S.hitStop, enabled: false },
  shake: { ...S.shake, enabled: false },
  sparks: { ...S.sparks, enabled: false },
  dust: { ...S.dust, enabled: false },
  damageNumbers: { ...S.damageNumbers, enabled: false },
}
const hit = { at: { x: 1, y: 1, z: 0 }, feet: { x: 1, y: 0, z: 0 }, damage: 10, guarded: false, toPlayer: false, down: false }

describe('game feel', () => {
  it('scales hit-stop and shake with damage, up to a cap, or not at all when off', () => {
    expect(hitStopFor(10, S)).toBeCloseTo(S.hitStop.base + 10 * S.hitStop.perDamage)
    expect(hitStopFor(10_000, S)).toBe(S.hitStop.max)
    expect(shakeFor(10_000, S)).toBe(S.shake.max)
    expect(hitStopFor(10, off)).toBe(0)
    expect(shakeFor(10, off)).toBe(0)
  })

  it('adds sparks and a damage number per hit, dust only when knocked down', () => {
    const f = createFeel()
    feelHit(f, S, hit)
    expect(f.effects.map((e) => e.kind)).toEqual(['sparks', 'number'])
    feelHit(f, S, { ...hit, guarded: true, toPlayer: true, down: true, damage: 3 })
    const [sparks, dust, num] = f.effects.slice(2)
    expect(sparks).toMatchObject({ kind: 'sparks', color: S.sparks.blockColor })
    expect(dust).toMatchObject({ kind: 'dust', x: 1, y: 0 })
    expect(num).toMatchObject({ kind: 'number', text: '3', color: S.damageNumbers.playerColor })
    expect(new Set(f.effects.map((e) => e.id)).size).toBe(5)
  })

  it('keeps the strongest hold and shake, and lets them die away', () => {
    const f = createFeel()
    feelHit(f, S, { ...hit, damage: 30 })
    const big = f.hold
    feelHit(f, S, { ...hit, damage: 1 })
    expect(f.hold).toBe(big)
    const shake = f.shake
    stepFeel(f, S, 0.1)
    expect(f.shake).toBeLessThan(shake)
    stepFeel(f, S, 5)
    expect(f.shake).toBe(0)
    expect(f.effects).toEqual([])
  })

  it('does nothing visible with every effect off', () => {
    const f = createFeel()
    feelHit(f, off, { ...hit, down: true })
    expect(f).toMatchObject({ hold: 0, shake: 0, effects: [] })
  })

  it('wobbles within the amplitude and spreads sparks all round', () => {
    for (let t = 0; t < 1; t += 0.013) {
      const o = shakeOffset(0.2, t)
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.2 + 1e-9)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.2 + 1e-9)
    }
    const d = sparkDirections(6, 3)
    expect(d).toHaveLength(6)
    expect(d.some((v) => v.x > 0) && d.some((v) => v.x < 0) && d.some((v) => v.y > 0) && d.some((v) => v.y < 0)).toBe(true)
  })
})
