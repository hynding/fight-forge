import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { getConfig } from '../content/active'
import type { ThemeDef } from '../config/defaults'
import { backdropShapes, type BackdropLayer } from '../sim/backdrop'
import type { StageView } from '../sim/stage'

// Extra width either side of the stage, so a layer's ends never show.
const MARGIN = 60

const Layer = ({ layer, length, backZ, view }: { layer: BackdropLayer; length: number; backZ: number; view: StageView }) => {
  const ref = useRef<Group>(null)
  // A layer with parallax p moves (p × camera X), so it only needs to span (1 - p) of the stage.
  const shapes = useMemo(
    () => backdropShapes(layer, -MARGIN, length * (1 - layer.parallax) + MARGIN),
    [layer, length]
  )
  useFrame(() => {
    if (ref.current) ref.current.position.x = view.cameraX * layer.parallax
  })
  const z = backZ - layer.distance
  return (
    <group ref={ref}>
      {shapes.map((s, i) =>
        layer.kind === 'hills' ? (
          <mesh key={i} position={[s.x, 0, z]} scale={[s.width / 2, s.height, 1.5]}>
            <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color={layer.color} />
          </mesh>
        ) : (
          <mesh key={i} position={[s.x, s.height / 2, z]}>
            <boxGeometry args={[s.width, s.height, 0.5]} />
            <meshBasicMaterial color={layer.color} />
          </mesh>
        )
      )}
    </group>
  )
}

/**
 * The theme's backdrop: flat-coloured silhouettes behind the back wall, each
 * layer following the camera by its parallax so far layers scroll slower.
 * Visual only (no colliders), and the shapes come from each layer's seed.
 */
export const Backdrop = ({ theme, length, view }: { theme: ThemeDef; length: number; view: StageView }) => {
  const { depthBand, wallThickness } = getConfig().stage
  const backZ = depthBand[0] - 0.5 - wallThickness
  return (
    <>
      {theme.backdrop.map((layer, i) => (
        <Layer key={i} layer={layer} length={length} backZ={backZ} view={view} />
      ))}
    </>
  )
}
