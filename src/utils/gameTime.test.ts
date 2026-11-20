import { describe, expect, it } from 'vitest'
import { MAX_FRAME_STEP, gameStep } from './gameTime'

describe('gameStep', () => {
  it('passes normal frame deltas through', () => {
    expect(gameStep(1 / 60)).toBeCloseTo(1 / 60)
  })

  it('clamps a long gap (e.g. returning to a hidden tab)', () => {
    expect(gameStep(60)).toBe(MAX_FRAME_STEP)
  })

  it('never goes negative', () => {
    expect(gameStep(-1)).toBe(0)
  })
})
