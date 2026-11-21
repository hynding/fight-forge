import { useContext, type ReactNode } from 'react'
import { Physics } from '@react-three/rapier'
import { HitStopContext } from '../sim/simContext'
import type { Vec3 } from '../config/defaults'

/** The scene's physics world: paused while the game is frozen, and during a hit-stop. */
export const ScenePhysics = ({ gravity, frozen, children }: { gravity: Vec3; frozen: boolean; children: ReactNode }) => {
  const hitStop = useContext(HitStopContext)
  return (
    <Physics gravity={gravity} paused={frozen || hitStop}>
      {children}
    </Physics>
  )
}
