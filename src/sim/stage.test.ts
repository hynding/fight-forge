import { describe, expect, it } from 'vitest'
import {
  cameraLimits,
  clampToBounds,
  createStageView,
  offscreenSpawn,
  screenBounds,
  stageBounds,
  stepCamera,
  visibleHalfWidth,
} from './stage'

const NO_BACK = { deadZone: 2, allowBacktrack: false }
const BACK = { deadZone: 2, allowBacktrack: true }
const LENGTH = 200

describe('stepCamera', () => {
  it('holds still while the target is inside the dead zone', () => {
    const v = createStageView(20, 10)
    stepCamera(v, 21.5, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(20)
  })

  it('follows the target out of the dead zone', () => {
    const v = createStageView(20, 10)
    stepCamera(v, 25, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(23)
  })

  it('never scrolls back when backtracking is off', () => {
    const v = createStageView(20, 10)
    stepCamera(v, 30, LENGTH, NO_BACK)
    stepCamera(v, 0, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(28)
  })

  it('scrolls back when allowed, but not past the stage start', () => {
    const v = createStageView(20, 10)
    stepCamera(v, 30, LENGTH, BACK)
    stepCamera(v, 15, LENGTH, BACK)
    expect(v.cameraX).toBe(17)
    stepCamera(v, -50, LENGTH, BACK)
    expect(v.cameraX).toBe(10) // halfWidth: the view's left edge is the stage start
  })

  it('stops at the stage end', () => {
    const v = createStageView(20, 10)
    stepCamera(v, 500, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(190)
  })

  it('holds still while locked, then follows again', () => {
    const v = createStageView(20, 10)
    v.lockX = 20
    stepCamera(v, 40, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(20)
    v.lockX = null
    stepCamera(v, 40, LENGTH, NO_BACK)
    expect(v.cameraX).toBe(38)
  })

  it('handles a stage narrower than the screen', () => {
    expect(cameraLimits(10, 12)).toEqual([10, 10])
  })
})

describe('bounds', () => {
  it('keeps the player inside the screen edges and the lane', () => {
    const b = screenBounds(createStageView(20, 10), [-3, 3], 1)
    expect(b).toEqual({ minX: 11, maxX: 29, minZ: -3, maxZ: 3 })
    expect(clampToBounds(5, 4, b)).toEqual({ x: 11, z: 3, changed: true })
    expect(clampToBounds(15, 0, b)).toEqual({ x: 15, z: 0, changed: false })
  })

  it('keeps enemies on the stage and in the lane', () => {
    expect(clampToBounds(-1, -9, stageBounds(LENGTH, [-3, 3]))).toEqual({ x: 0, z: -3, changed: true })
  })
})

describe('offscreenSpawn', () => {
  it('spawns just past either screen edge, at a depth in the lane', () => {
    const v = createStageView(50, 10)
    expect(offscreenSpawn(v, 1, 2, 0.5, LENGTH, [-3, 3])).toEqual({ x: 62, z: 0 })
    expect(offscreenSpawn(v, -1, 2, 0, LENGTH, [-3, 3])).toEqual({ x: 38, z: -3 })
  })

  it('stays on the stage', () => {
    expect(offscreenSpawn(createStageView(10, 10), -1, 2, 1, LENGTH, [-3, 3]).x).toBe(0)
  })
})

describe('visibleHalfWidth', () => {
  it('widens with distance and aspect', () => {
    expect(visibleHalfWidth(10, 90, 1)).toBeCloseTo(10)
    expect(visibleHalfWidth(10, 90, 2)).toBeCloseTo(20)
  })
})
