import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  canClaimAttackSlot,
  createAttackSlotTimer,
  createPlayerAttackState,
  startAttackSlotHold,
  stepAttackSlot,
  stepIntervalClock,
  stepPlayerAttack,
} from './timers'

const ATTACK = { duration: 0.2, cooldown: 0.5 }
const SLOT = { attackSlotDuration: 1, attackSlotRecovery: 1 }

/** Steps `fn` at the sim rate until it returns truthy; returns the step count. */
const stepsUntil = (fn: () => unknown, max = 1000) => {
  for (let i = 1; i <= max; i++) if (fn()) return i
  throw new Error('never happened')
}

describe('stepPlayerAttack', () => {
  it('starts a swing when requested and off cooldown', () => {
    const s = createPlayerAttackState()
    expect(stepPlayerAttack(s, false, SIM_STEP, ATTACK)).toBeNull()
    expect(stepPlayerAttack(s, true, SIM_STEP, ATTACK)).toBe('started')
    expect(s.active).toBe(true)
    expect(s.swing).toBe(1)
  })

  it('ends the swing after its duration', () => {
    const s = createPlayerAttackState()
    stepPlayerAttack(s, true, SIM_STEP, ATTACK)
    const steps = stepsUntil(() => stepPlayerAttack(s, true, SIM_STEP, ATTACK) === 'ended')
    expect(steps).toBe(Math.round(ATTACK.duration / SIM_STEP))
    expect(s.active).toBe(false)
  })

  it('holds the next swing until the cooldown (from swing start) runs out', () => {
    const s = createPlayerAttackState()
    stepPlayerAttack(s, true, SIM_STEP, ATTACK)
    const steps = stepsUntil(() => stepPlayerAttack(s, true, SIM_STEP, ATTACK) === 'started')
    expect(steps).toBe(Math.round(ATTACK.cooldown / SIM_STEP))
    expect(s.swing).toBe(2)
  })
})

describe('attack slot timer', () => {
  it('can be claimed when idle, not while holding or recovering', () => {
    const t = createAttackSlotTimer()
    expect(canClaimAttackSlot(t)).toBe(true)
    startAttackSlotHold(t, SLOT)
    expect(canClaimAttackSlot(t)).toBe(false)

    const holdSteps = stepsUntil(() => stepAttackSlot(t, SIM_STEP, SLOT))
    expect(holdSteps).toBe(Math.round(SLOT.attackSlotDuration / SIM_STEP))
    expect(canClaimAttackSlot(t)).toBe(false)

    const recoverySteps = stepsUntil(() => {
      stepAttackSlot(t, SIM_STEP, SLOT)
      return canClaimAttackSlot(t)
    })
    expect(recoverySteps).toBe(Math.round(SLOT.attackSlotRecovery / SIM_STEP))
  })

  it('reports the hold ending exactly once', () => {
    const t = createAttackSlotTimer()
    startAttackSlotHold(t, SLOT)
    let ends = 0
    for (let i = 0; i < 300; i++) if (stepAttackSlot(t, SIM_STEP, SLOT)) ends++
    expect(ends).toBe(1)
  })
})

describe('stepIntervalClock', () => {
  it('fires once per interval', () => {
    const c = { elapsed: 0 }
    let fires = 0
    for (let i = 0; i < 60 * 20; i++) if (stepIntervalClock(c, SIM_STEP, 5)) fires++
    expect(fires).toBe(4)
  })
})
