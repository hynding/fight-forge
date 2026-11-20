import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DirectionalLight, PerspectiveCamera, Vector3 } from 'three'
import { DEFAULT_CONFIG } from '../config/defaults'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimSystem } from '../sim/simContext'
import { stepCamera, visibleHalfWidth, type StageView } from '../sim/stage'

const CAMERA = DEFAULT_CONFIG.camera
// The key light sits up and to the right of the screen centre; its shadow
// camera follows so shadows exist wherever the view has scrolled to.
const LIGHT_OFFSET = new Vector3(10, 20, 10)

interface CameraRigProps {
  view: StageView
  stageLength: number
  playerPositionRef: RefObject<Vector3>
  lightRef: RefObject<DirectionalLight>
}

/**
 * Side-on scrolling camera. The follow (dead zone, no backtracking, stage
 * clamp) is a sim system, so the player's screen bounds are game state; the
 * render loop only places the camera and light where the view says.
 */
export const CameraRig = ({ view, stageLength, playerPositionRef, lightRef }: CameraRigProps) => {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const placed = useRef(false)

  useSimSystem('camera', SYSTEM_ORDER.camera, () => {
    const p = playerPositionRef.current
    if (p) stepCamera(view, p.x, stageLength, CAMERA)
  })

  useFrame(() => {
    view.halfWidth = visibleHalfWidth(
      Math.hypot(CAMERA.distance - CAMERA.lookAtDepth, CAMERA.height - CAMERA.lookAtHeight),
      CAMERA.fov,
      aspect
    )
    // Before the first sim step, settle the view on the player at once.
    if (!placed.current && playerPositionRef.current) {
      view.cameraX = view.maxCameraX = playerPositionRef.current.x
      stepCamera(view, playerPositionRef.current.x, stageLength, CAMERA)
      placed.current = true
    }

    if ((camera as PerspectiveCamera).fov !== CAMERA.fov) {
      ;(camera as PerspectiveCamera).fov = CAMERA.fov
      camera.updateProjectionMatrix()
    }
    camera.position.set(view.cameraX, CAMERA.height, CAMERA.distance)
    camera.lookAt(view.cameraX, CAMERA.lookAtHeight, CAMERA.lookAtDepth)

    const light = lightRef.current
    if (light) {
      light.position.set(view.cameraX + LIGHT_OFFSET.x, LIGHT_OFFSET.y, LIGHT_OFFSET.z)
      light.target.position.set(view.cameraX, 0, 0)
      light.target.updateMatrixWorld()
    }
  })

  return null
}
