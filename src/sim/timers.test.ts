import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  canClaimAttackSlot,
  releaseAttackSlotEarly,
  createAttackSlotTimer,
  startAttackSlotHold,
  stepAttackSlot,
  stepIntervalClock,
} from './timers'

const SLOT = { attackSlotDuration: 1, attackSlotRecovery: 1 }

/** Steps `fn` at the sim rate until it returns truthy; returns the step count. */
const stepsUntil = (fn: () => unknown, max = 1000) => {
  for (let i = 1; i <= max; i++) if (fn()) return i
  throw new Error('never happened')
}

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

describe('releaseAttackSlotEarly', () => {
  it('ends the hold and starts recovery', () => {
    const t = createAttackSlotTimer()
    startAttackSlotHold(t, SLOT)
    releaseAttackSlotEarly(t, SLOT)
    expect(t.holdLeft).toBe(0)
    expect(t.recoveryLeft).toBe(SLOT.attackSlotRecovery)
    expect(canClaimAttackSlot(t)).toBe(false)
  })

  it('does nothing when not holding', () => {
    const t = createAttackSlotTimer()
    releaseAttackSlotEarly(t, SLOT)
    expect(canClaimAttackSlot(t)).toBe(true)
  })
})
