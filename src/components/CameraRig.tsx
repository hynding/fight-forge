import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DirectionalLight, PerspectiveCamera, Vector3 } from 'three'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimSystem } from '../sim/simContext'
import { stepCamera, visibleHalfWidth, type StageView } from '../sim/stage'
import { shakeOffset } from '../sim/feel'

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
  const CAMERA = getConfig().camera
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const placed = useRef(false)
  const feel = useFeel()

  useSimSystem('camera', SYSTEM_ORDER.camera, () => {
    const p = playerPositionRef.current
    if (p) stepCamera(view, p.x, stageLength, CAMERA)
  })

  useFrame(({ clock }) => {
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
    // Screen shake (from hits) moves the camera and its target together, so the view jolts without tilting.
    const shake = feel.shake > 0 ? shakeOffset(feel.shake, clock.elapsedTime) : { x: 0, y: 0 }
    camera.position.set(view.cameraX + shake.x, CAMERA.height + shake.y, CAMERA.distance)
    camera.lookAt(view.cameraX + shake.x, CAMERA.lookAtHeight + shake.y, CAMERA.lookAtDepth)

    const light = lightRef.current
    if (light) {
      light.position.set(view.cameraX + LIGHT_OFFSET.x, LIGHT_OFFSET.y, LIGHT_OFFSET.z)
      light.target.position.set(view.cameraX, 0, 0)
      light.target.updateMatrixWorld()
    }
  })

  return null
}
