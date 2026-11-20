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
  /** Half the visible width at the depth lane's centre (set from the viewport). */
  halfWidth: number
}

export const createStageView = (cameraX: number, halfWidth = 10): StageView => ({
  cameraX,
  maxCameraX: cameraX,
  halfWidth,
})

/** Camera X range that keeps the view inside the stage [0, length]. */
export const cameraLimits = (halfWidth: number, stageLength: number): [number, number] => {
  const min = halfWidth
  const max = Math.max(min, stageLength - halfWidth)
  return [min, max]
}

/**
 * Moves the camera only when the target leaves the dead zone around screen
 * centre, clamps to the stage, and (unless backtracking is allowed) never
 * scrolls back left of the farthest point reached. Mutates and returns `view`.
 */
export const stepCamera = (
  view: StageView,
  targetX: number,
  stageLength: number,
  cfg: CameraFollowConfig
): StageView => {
  let x = view.cameraX
  if (targetX > x + cfg.deadZone) x = targetX - cfg.deadZone
  else if (targetX < x - cfg.deadZone) x = targetX + cfg.deadZone

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

/** The on-screen area the player must stay in (inside the screen edges and the lane). */
export const screenBounds = (
  view: StageView,
  depthBand: [number, number],
  edgeMargin: number
): Bounds => ({
  minX: view.cameraX - view.halfWidth + edgeMargin,
  maxX: view.cameraX + view.halfWidth - edgeMargin,
  minZ: depthBand[0],
  maxZ: depthBand[1],
})

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
