import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  blockedHit,
  canDodge,
  createDodgeState,
  createRunDetector,
  facesAttacker,
  isDodging,
  startDodge,
  stepDodge,
  stepRunDetector,
} from './defense'
import type { MoveDef } from './moves'

const CFG = {
  run: { speedFactor: 1.8, doubleTapWindow: 0.25 },
  block: { damageFactor: 0.2, blockstun: 0.2, knockbackFactor: 0.5 },
  dodge: { duration: 0.3, speed: 7, cooldown: 0.2 },
}

const LAUNCHER: MoveDef = {
  startup: 0.1,
  active: 0.1,
  recovery: 0.3,
  damage: 20,
  hitbox: { forward: 1, up: 0, halfX: 0.5, halfY: 0.5, halfZ: 0.5 },
  reaction: { hitstun: 0, knockback: { x: 5, y: 6 }, knockdown: true },
}

const stepFor = (s: ReturnType<typeof createDodgeState>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_STEP); i++) stepDodge(s, SIM_STEP)
}

describe('blocking', () => {
  it('blocks only attacks from the side the defender faces', () => {
    expect(facesAttacker(1, 0, 2)).toBe(true)
    expect(facesAttacker(1, 0, -2)).toBe(false)
    expect(facesAttacker(-1, 0, -2)).toBe(true)
  })

  it('turns a launcher into chip damage, blockstun and a short push', () => {
    expect(blockedHit(LAUNCHER, CFG.block)).toEqual({ damage: 4, blockstun: 0.2, knockbackX: 2.5 })
  })
})

describe('dodge', () => {
  it('steps into the background by default, or the held depth direction', () => {
    const s = createDodgeState()
    startDodge(s, 0, CFG.dodge)
    expect(s.dirZ).toBe(-1)
    const t = createDodgeState()
    startDodge(t, 1, CFG.dodge)
    expect(t.dirZ).toBe(1)
  })

  it('lasts its duration, then waits out the cooldown', () => {
    const s = createDodgeState()
    startDodge(s, 0, CFG.dodge)
    stepFor(s, 0.25)
    expect(isDodging(s)).toBe(true)
    stepFor(s, 0.05)
    expect(isDodging(s)).toBe(false)
    expect(canDodge(s)).toBe(false)
    stepFor(s, 0.2)
    expect(canDodge(s)).toBe(true)
  })
})

describe('run detector', () => {
  const tap = (r: ReturnType<typeof createRunDetector>, dir: number, t: number) =>
    stepRunDetector(r, dir, t, CFG.run)

  it('runs on a double-tap and hold, stops on release', () => {
    const r = createRunDetector()
    expect(tap(r, 1, 0)).toBe(false)
    expect(tap(r, 0, 0.1)).toBe(false)
    expect(tap(r, 1, 0.2)).toBe(true)
    expect(tap(r, 1, 0.5)).toBe(true)
    expect(tap(r, 0, 0.6)).toBe(false)
  })

  it('ignores slow taps and taps in different directions', () => {
    const slow = createRunDetector()
    tap(slow, 1, 0)
    tap(slow, 0, 0.1)
    expect(tap(slow, 1, 0.4)).toBe(false)
    const mixed = createRunDetector()
    tap(mixed, -1, 0)
    tap(mixed, 0, 0.05)
    expect(tap(mixed, 1, 0.1)).toBe(false)
  })
})
