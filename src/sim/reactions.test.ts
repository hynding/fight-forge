import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import { applyHit, createReactionState, isInvulnerable, stepReaction } from './reactions'

const CFG = { knockdownDuration: 1, getupDuration: 0.5, getupInvulnerability: 0.5, knockbackFriction: 0.9 }
const LIGHT = { hitstun: 0.3, knockback: { x: 1, y: 0 } }
const LAUNCH = { hitstun: 0, knockback: { x: 4, y: 6 }, knockdown: true }

const stepFor = (s: ReturnType<typeof createReactionState>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_STEP); i++) stepReaction(s, SIM_STEP, CFG)
}

describe('reactions', () => {
  it('stuns for the hit\'s hitstun, then recovers', () => {
    const s = createReactionState()
    expect(applyHit(s, LIGHT, CFG)).toBe(true)
    expect(s.kind).toBe('hitstun')
    stepFor(s, 0.25)
    expect(s.kind).toBe('hitstun')
    stepFor(s, 0.05)
    expect(s.kind).toBeNull()
  })

  it('restarts hitstun on a hit during hitstun (combos)', () => {
    const s = createReactionState()
    applyHit(s, LIGHT, CFG)
    stepFor(s, 0.2)
    expect(applyHit(s, LIGHT, CFG)).toBe(true)
    expect(s.timeLeft).toBeCloseTo(0.3)
  })

  it('knocks down, gets up, then is briefly invulnerable', () => {
    const s = createReactionState()
    applyHit(s, LAUNCH, CFG)
    expect(s.kind).toBe('knockdown')
    expect(applyHit(s, LIGHT, CFG)).toBe(false)
    stepFor(s, 1)
    expect(s.kind).toBe('getup')
    expect(isInvulnerable(s)).toBe(true)
    stepFor(s, 0.5)
    expect(s.kind).toBeNull()
    expect(isInvulnerable(s)).toBe(true)
    expect(applyHit(s, LIGHT, CFG)).toBe(false)
    stepFor(s, 0.5)
    expect(isInvulnerable(s)).toBe(false)
    expect(applyHit(s, LIGHT, CFG)).toBe(true)
  })
})
