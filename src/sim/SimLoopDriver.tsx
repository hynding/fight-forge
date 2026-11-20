import { useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SimLoop } from './loop'
import { SimLoopContext } from './simContext'
import { isFrozen, useGameStore } from '../store/gameStore'

/**
 * Owns the scene's `SimLoop` and advances it once per rendered frame, unless
 * the game is paused or over. Must be inside the r3f `<Canvas>`. A restart
 * remounts the scene (see `gameId`), which creates a fresh loop.
 */
export const SimLoopDriver = ({ children }: { children: ReactNode }) => {
  const [loop] = useState(() => new SimLoop())

  useFrame((_, delta) => {
    if (isFrozen(useGameStore.getState())) return
    loop.advance(delta)
  })

  return <SimLoopContext.Provider value={loop}>{children}</SimLoopContext.Provider>
}
