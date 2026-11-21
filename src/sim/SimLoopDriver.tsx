import { useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SimLoop } from './loop'
import { FeelContext, HitStopContext, SimLoopContext } from './simContext'
import { createFeel, slowFrame } from './feel'
import { isFrozen, useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'

/**
 * Owns the scene's `SimLoop` and advances it once per rendered frame, unless
 * the game is paused or over. Must be inside the r3f `<Canvas>`. A restart
 * remounts the scene (see `gameId`), which creates a fresh loop.
 *
 * It also owns the scene's game feel: during a hit-stop (`feel.hold`) the
 * loop doesn't advance and physics pauses (`HitStopContext`), so the whole
 * fight holds for a moment, then carries on from exactly where it was.
 * Slow motion (`feel.slow`) works the same way on only some of the frames.
 */
export const SimLoopDriver = ({ children }: { children: ReactNode }) => {
  const [loop] = useState(() => new SimLoop())
  const [feel] = useState(createFeel)
  const [stopped, setStopped] = useState(false)

  useFrame((_, delta) => {
    if (isFrozen(useGameStore.getState())) return
    if (feel.hold > 0) {
      feel.hold = Math.max(0, feel.hold - gameStep(delta))
      if (!stopped) setStopped(true)
      return
    }
    // Slow motion (a boss KO): only some frames advance the fight and physics.
    const advance = slowFrame(feel, gameStep(delta))
    if (advance === stopped) setStopped(!advance)
    if (advance) loop.advance(delta)
  })

  return (
    <SimLoopContext.Provider value={loop}>
      <FeelContext.Provider value={feel}>
        <HitStopContext.Provider value={stopped}>{children}</HitStopContext.Provider>
      </FeelContext.Provider>
    </SimLoopContext.Provider>
  )
}
