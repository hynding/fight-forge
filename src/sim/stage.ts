// Side-scrolling stage math: the camera's horizontal follow, the screen's
// visible width, the bounds fighters stay in, and off-screen spawn points.
// Pure TS, unit-tested.

export interface CameraFollowConfig {
  deadZone: number
  allowBacktrack: boolean
}

/** Horizontal camera state, shared by the camera system, the renderer, and bounds. */
export interface StageView {
  /** Screen centre on the X axis. */
  cameraX: number
  /** Farthest the camera has scrolled forward (used when backtracking is off). */
  maxCameraX: number
  /** Half the visible width at depth `halfWidthZ` (the camera's look-at depth, the back of the lane; set from the viewport). */
  halfWidth: number
  /** The depth (z) `halfWidth` is measured at. */
  halfWidthZ: number
  /**
   * How the visible half width changes per metre of depth toward the camera
   * (negative: the view is narrower at the front of the lane). 0 treats every
   * depth alike.
   */
  halfWidthSlope: number
  /** While set (a level's screen lock), the camera holds at this X. */
  lockX: number | null
}

export const createStageView = (cameraX: number, halfWidth = 10): StageView => ({
  cameraX,
  maxCameraX: cameraX,
  halfWidth,
  halfWidthZ: 0,
  halfWidthSlope: 0,
  lockX: null,
})

/** The visible half width at depth `z` (narrower toward the camera, in perspective). */
export const halfWidthAt = (view: StageView, z: number): number =>
  Math.max(0, view.halfWidth + view.halfWidthSlope * (z - view.halfWidthZ))

/**
 * The perspective camera's visible half width at the look-at point, and how
 * it changes with depth: a point's distance along the view direction is
 * linear in z, and the visible width is linear in that distance.
 */
export const viewWidths = (
  cam: { height: number; distance: number; lookAtHeight: number; lookAtDepth: number; fov: number },
  aspect: number
): { halfWidth: number; halfWidthZ: number; halfWidthSlope: number } => {
  const dy = cam.lookAtHeight - cam.height
  const dz = cam.lookAtDepth - cam.distance
  const len = Math.hypot(dy, dz)
  const k = Math.tan((cam.fov * Math.PI) / 360) * aspect
  return { halfWidth: len * k, halfWidthZ: cam.lookAtDepth, halfWidthSlope: (dz / len) * k }
}

/** Camera X range that keeps the view inside the stage [0, length]. */
export const cameraLimits = (halfWidth: number, stageLength: number): [number, number] => {
  const min = halfWidth
  const max = Math.max(min, stageLength - halfWidth)
  return [min, max]
}

/** With several players: the one furthest behind, and how close to the screen edge they may be. */
export interface CameraLeash {
  rearX: number
  edgeMargin: number
  /** The visible half width where the rear player stands (default: `halfWidth`). */
  rearHalfWidth?: number
}

/**
 * Moves the camera only when the target leaves the dead zone around screen
 * centre, clamps to the stage, and (unless backtracking is allowed) never
 * scrolls back left of the farthest point reached. A screen lock holds it
 * still. With a `leash`, it doesn't scroll forward past where the player
 * furthest behind would leave the screen. Mutates and returns `view`.
 */
export const stepCamera = (
  view: StageView,
  targetX: number,
  stageLength: number,
  cfg: CameraFollowConfig,
  leash?: CameraLeash
): StageView => {
  if (view.lockX !== null) {
    view.cameraX = view.lockX
    return view
  }
  let x = view.cameraX
  if (targetX > x + cfg.deadZone) x = targetX - cfg.deadZone
  else if (targetX < x - cfg.deadZone) x = targetX + cfg.deadZone

  // The player furthest behind holds the camera back, so nobody is pushed off the left edge.
  if (leash) x = Math.min(x, Math.max(view.cameraX, leash.rearX + (leash.rearHalfWidth ?? view.halfWidth) - leash.edgeMargin))

  const [min, max] = cameraLimits(view.halfWidth, stageLength)
  const floor = cfg.allowBacktrack ? min : Math.max(min, view.maxCameraX)
  x = Math.min(max, Math.max(floor, x))

  view.cameraX = x
  view.maxCameraX = Math.max(view.maxCameraX, x)
  return view
}

/** Half the visible width at distance `distance` for a vertical FOV and aspect. */
export const visibleHalfWidth = (distance: number, fovDegrees: number, aspect: number): number =>
  distance * Math.tan((fovDegrees * Math.PI) / 360) * aspect

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * The on-screen area a player must stay in (inside the screen edges and the
 * lane), for a fighter at depth `z`: the screen is narrower toward the camera.
 */
export const screenBounds = (
  view: StageView,
  depthBand: [number, number],
  edgeMargin: number,
  z = view.halfWidthZ
): Bounds => {
  const half = Math.max(edgeMargin, halfWidthAt(view, z))
  return {
    minX: view.cameraX - half + edgeMargin,
    maxX: view.cameraX + half - edgeMargin,
    minZ: depthBand[0],
    maxZ: depthBand[1],
  }
}

/** The whole stage (enemies may wander off-screen but not off the stage or out of the lane). */
export const stageBounds = (stageLength: number, depthBand: [number, number]): Bounds => ({
  minX: 0,
  maxX: stageLength,
  minZ: depthBand[0],
  maxZ: depthBand[1],
})

export interface Clamped {
  x: number
  z: number
  /** True if the position had to move. */
  changed: boolean
}

export const clampToBounds = (x: number, z: number, b: Bounds): Clamped => {
  const cx = Math.min(b.maxX, Math.max(b.minX, x))
  const cz = Math.min(b.maxZ, Math.max(b.minZ, z))
  return { x: cx, z: cz, changed: cx !== x || cz !== z }
}

/**
 * A spawn point just off the left or right screen edge (`side` -1 or 1),
 * clamped to the stage, at a depth in the lane chosen by `depthT` in [0, 1].
 */
export const offscreenSpawn = (
  view: StageView,
  side: -1 | 1,
  margin: number,
  depthT: number,
  stageLength: number,
  depthBand: [number, number]
): { x: number; z: number } => {
  const x = view.cameraX + side * (view.halfWidth + margin)
  return {
    x: Math.min(stageLength, Math.max(0, x)),
    z: depthBand[0] + depthT * (depthBand[1] - depthBand[0]),
  }
}
