import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  facingToYaw,
  isMoving,
  nextFighterState,
  stepVelocity,
  updateFacing,
  type FighterStateInputs,
} from './fighter'

const base: FighterStateInputs = { dead: false, attacking: false, grounded: true, moving: false }
const PLAYER = { walkSpeed: 5, deceleration: 0.85, stopSpeed: 0.1 }
const ENEMY = { walkSpeed: 2, deceleration: 0, stopSpeed: 0.1 }

describe('nextFighterState', () => {
  it('is idle when grounded and still', () => {
    expect(nextFighterState(base)).toBe('idle')
  })

  it('walks when grounded and moving', () => {
    expect(nextFighterState({ ...base, moving: true })).toBe('walk')
  })

  it('is airborne (jump) when not grounded, moving or not', () => {
    expect(nextFighterState({ ...base, grounded: false })).toBe('jump')
    expect(nextFighterState({ ...base, grounded: false, moving: true })).toBe('jump')
  })

  it('attacks over moving and jumping', () => {
    expect(nextFighterState({ ...base, attacking: true, moving: true })).toBe('attack')
    expect(nextFighterState({ ...base, attacking: true, grounded: false })).toBe('attack')
  })

  it('dead wins over everything', () => {
    expect(
      nextFighterState({ dead: true, attacking: true, grounded: false, moving: true })
    ).toBe('dead')
  })
})

describe('stepVelocity', () => {
  it('accelerates instantly to the intent', () => {
    expect(stepVelocity({ x: 0, z: 0 }, { x: 1, z: -1 }, PLAYER, SIM_STEP)).toEqual({ x: 5, z: -5 })
  })

  it('scales by the intent magnitude (patrol and circling are slower)', () => {
    expect(stepVelocity({ x: 0, z: 0 }, { x: 0.3, z: 0 }, ENEMY, SIM_STEP).x).toBeCloseTo(0.6)
  })

  it('decelerates the player by 0.85 per 60 Hz step and snaps to 0', () => {
    const v = stepVelocity({ x: 5, z: 0 }, { x: 0, z: 0 }, PLAYER, SIM_STEP)
    expect(v.x).toBeCloseTo(4.25)
    let cur = v
    for (let i = 0; i < 100; i++) cur = stepVelocity(cur, { x: 0, z: 0 }, PLAYER, SIM_STEP)
    expect(cur).toEqual({ x: 0, z: 0 })
  })

  it('stops enemies instantly', () => {
    expect(stepVelocity({ x: 2, z: 1 }, { x: 0, z: 0 }, ENEMY, SIM_STEP)).toEqual({ x: 0, z: 0 })
  })
})

describe('facing', () => {
  it('faces left or right by horizontal velocity', () => {
    const f = { x: 1, z: 0 }
    updateFacing(f, { x: -3, z: 2 })
    expect(f).toEqual({ x: -1, z: 0 })
    updateFacing(f, { x: 0.5, z: 0 })
    expect(f).toEqual({ x: 1, z: 0 })
  })

  it('keeps the last side when moving only in depth or stopped', () => {
    const f = { x: -1, z: 0 }
    updateFacing(f, { x: 0, z: 5 })
    expect(f).toEqual({ x: -1, z: 0 })
    updateFacing(f, { x: 0, z: 0 })
    expect(f).toEqual({ x: -1, z: 0 })
  })

  it('prefers an explicit face direction', () => {
    const f = { x: 1, z: 0 }
    updateFacing(f, { x: 1, z: 0 }, { x: -2, z: 1 })
    expect(f).toEqual({ x: -1, z: 0 })
  })

  it('maps facing to model yaw (models face -Z)', () => {
    expect(facingToYaw({ x: 0, z: -1 })).toBeCloseTo(0)
    expect(facingToYaw({ x: 1, z: 0 })).toBeCloseTo(-Math.PI / 2)
  })

  it('isMoving uses the stop speed per axis', () => {
    expect(isMoving({ x: 0.05, z: 0.05 }, 0.1)).toBe(false)
    expect(isMoving({ x: 0, z: -0.2 }, 0.1)).toBe(true)
  })
})
