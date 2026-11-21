import { describe, expect, it } from 'vitest'
import { bossPhaseIndex, createPoiseState, phaseStats, poiseHit, stepPoise, transitionPush, type BossPhase } from './boss'

const phases: BossPhase[] = [
  { below: 0.6, speed: 3, attacks: [{ move: 'slam', range: 'near' }] },
  { below: 0.25, armor: 0.8, color: '#ff0000' },
]
const base = { speed: 2, aggression: 1.5, armor: 0.4, ai: 'brawler', attacks: [{ move: 'swipe', range: 'near' as const }], color: '#ffffff' }

describe('boss phases', () => {
  it('counts the phases started at a health fraction', () => {
    expect(bossPhaseIndex(phases, 1)).toBe(0)
    expect(bossPhaseIndex(phases, 0.6)).toBe(0)
    expect(bossPhaseIndex(phases, 0.59)).toBe(1)
    expect(bossPhaseIndex(phases, 0.1)).toBe(2)
    expect(bossPhaseIndex([], 0)).toBe(0)
  })

  it('layers each phase on the ones before, keeping what it leaves out', () => {
    expect(phaseStats(base, phases, 0)).toEqual(base)
    expect(phaseStats(base, phases, 1)).toEqual({ ...base, speed: 3, attacks: [{ move: 'slam', range: 'near' }] })
    expect(phaseStats(base, phases, 2)).toEqual({ ...base, speed: 3, attacks: [{ move: 'slam', range: 'near' }], armor: 0.8, color: '#ff0000' })
  })
})

describe('poise', () => {
  const cfg = { hits: 3, window: 2 }
  const knockdown = { hitstun: 0.3, knockback: { x: 4, y: 5 }, knockdown: true }
  const jab = { hitstun: 0.25, knockback: { x: 1, y: 0 } }

  it('turns knockdowns into staggers until enough hits land in a row', () => {
    const s = createPoiseState()
    expect(poiseHit(s, cfg, jab)).toBe(jab)
    expect(poiseHit(s, cfg, knockdown)).toEqual({ hitstun: 0.3, knockback: { x: 4, y: 0 }, knockdown: false })
    expect(poiseHit(s, cfg, knockdown)).toBe(knockdown)
    // The count starts again after a knockdown lands.
    expect(poiseHit(s, cfg, knockdown).knockdown).toBe(false)
  })

  it('forgets the hits when the window passes without one', () => {
    const s = createPoiseState()
    poiseHit(s, cfg, jab)
    poiseHit(s, cfg, jab)
    stepPoise(s, 1.9)
    expect(s.hits).toBe(2)
    stepPoise(s, 0.2)
    expect(s.hits).toBe(0)
    expect(poiseHit(s, cfg, knockdown).knockdown).toBe(false)
  })

  it('so a juggle can\'t go on forever: at most one knockdown in every three hits', () => {
    const s = createPoiseState()
    const downs = Array.from({ length: 9 }, () => poiseHit(s, cfg, knockdown).knockdown).filter(Boolean)
    expect(downs).toHaveLength(3)
  })
})

describe('phase change push', () => {
  const cfg = { duration: 1, push: 6, radius: 3 }
  it('pushes fighters within the radius away from the boss', () => {
    expect(transitionPush(cfg, 2, 0)).toBe(6)
    expect(transitionPush(cfg, -1, 1)).toBe(-6)
    expect(transitionPush(cfg, 4, 0)).toBe(0)
  })
})
