import { describe, expect, it } from 'vitest'
import { addPhase, bossSandboxLevel, defaultBoss, movePhase, phaseStartHealth, phaseSummary, removePhase } from './boss'
import { validateLevel } from '../sim/level'

describe('Forge boss editing', () => {
  it('starts a boss with no phases and the type as its title', () => {
    expect(defaultBoss('dock_boss')).toMatchObject({ title: 'DOCK_BOSS', phases: [] })
  })

  it('adds phases in threshold order, and not on top of another', () => {
    let { boss, index } = addPhase(defaultBoss('B'), 0.3)
    expect(index).toBe(0)
    ;({ boss, index } = addPhase(boss, 0.6123))
    expect(index).toBe(0)
    expect(boss.phases.map((p) => p.below)).toEqual([0.61, 0.3])
    const again = addPhase(boss, 0.305)
    expect(again.boss).toBe(boss)
    expect(again.index).toBe(1)
    expect(addPhase(defaultBoss('B'), 1.5).boss.phases[0].below).toBe(0.98)
  })

  it('drags a threshold only as far as its neighbours', () => {
    const boss = { ...defaultBoss('B'), phases: [{ below: 0.6 }, { below: 0.3 }] }
    expect(movePhase(boss, 1, 0.9).phases[1].below).toBe(0.58)
    expect(movePhase(boss, 0, 0.1).phases[0].below).toBe(0.32)
    expect(movePhase(boss, 0, 2).phases[0].below).toBe(0.98)
    expect(removePhase(boss, 0).phases).toEqual([{ below: 0.3 }])
  })

  it('says what a phase changes', () => {
    expect(phaseSummary({ below: 0.5 })).toBe('no changes yet')
    expect(phaseSummary({ below: 0.5, speed: 3, summon: { enemies: [{ type: 'FAST', from: 'right' }] } })).toBe('speed 3, summons 1')
  })

  it('starts a sandbox boss just below the chosen phase\'s threshold', () => {
    const boss = { ...defaultBoss('B'), phases: [{ below: 0.6 }, { below: 0.25 }] }
    expect(phaseStartHealth(boss, 0)).toBe(1)
    expect(phaseStartHealth(boss, 1)).toBeCloseTo(0.59)
    expect(phaseStartHealth(boss, 2)).toBeCloseTo(0.24)
  })

  it('makes a valid one-screen boss level', () => {
    expect(validateLevel(bossSandboxLevel('HARV'))).toEqual([])
  })
})
