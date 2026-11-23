import { describe, expect, it } from 'vitest'
import {
  cameraLimits,
  clampToBounds,
  createStageView,
  halfWidthAt,
  offscreenSpawn,
  screenBounds,
  stageBounds,
  stepCamera,
  viewWidths,
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

  it('waits for the player furthest behind', () => {
    const v = createStageView(20, 10)
    // The rear player is 1 m inside the left edge (margin 1): no scrolling forward.
    stepCamera(v, 30, LENGTH, NO_BACK, { rearX: 11, edgeMargin: 1 })
    expect(v.cameraX).toBe(20)
    // They catch up 3 m: the camera moves 3 m.
    stepCamera(v, 30, LENGTH, NO_BACK, { rearX: 14, edgeMargin: 1 })
    expect(v.cameraX).toBe(23)
    // A leash never scrolls back.
    stepCamera(v, 30, LENGTH, NO_BACK, { rearX: 5, edgeMargin: 1 })
    expect(v.cameraX).toBe(23)
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

  it('narrows the screen bounds toward the front of the lane', () => {
    const view = { ...createStageView(20, 10), halfWidthZ: -3, halfWidthSlope: -0.5 }
    expect(halfWidthAt(view, -3)).toBe(10)
    expect(halfWidthAt(view, 3)).toBe(7)
    expect(screenBounds(view, [-3, 3], 1, 3)).toEqual({ minX: 14, maxX: 26, minZ: -3, maxZ: 3 })
    // Without a depth, the bounds are those at the look-at depth.
    expect(screenBounds(view, [-3, 3], 1).maxX).toBe(29)
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

describe('viewWidths', () => {
  const cam = { height: 6, distance: 12, lookAtHeight: 2.5, lookAtDepth: -3, fov: 50 }

  it('measures the half width at the look-at depth, narrower nearer the camera', () => {
    const w = viewWidths(cam, 16 / 9)
    expect(w.halfWidthZ).toBe(-3)
    expect(w.halfWidth).toBeCloseTo(Math.hypot(3.5, 15) * Math.tan((25 * Math.PI) / 180) * (16 / 9))
    const view = { ...createStageView(0, 0), ...w }
    expect(halfWidthAt(view, 3)).toBeLessThan(w.halfWidth)
    // A point on the camera's plane (z = distance along the view axis) sees nothing.
    expect(halfWidthAt(view, -3 + Math.hypot(3.5, 15) ** 2 / 15)).toBeCloseTo(0)
  })
})
