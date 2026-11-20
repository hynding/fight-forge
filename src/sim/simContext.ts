import { createContext, useContext, useEffect, useRef } from 'react'
import type { SimLoop, SystemStep } from './loop'

export const SimLoopContext = createContext<SimLoop | null>(null)

export const useSimLoop = (): SimLoop => {
  const loop = useContext(SimLoopContext)
  if (!loop) throw new Error('useSimLoop must be used inside <SimLoopDriver>')
  return loop
}

/**
 * Registers `step` as a fixed-step system for the component's lifetime. The
 * latest `step` closure is always the one called, so it can read fresh props.
 */
export const useSimSystem = (name: string, order: number, step: SystemStep): void => {
  const loop = useSimLoop()
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  useEffect(() => loop.add(name, order, (dt) => stepRef.current(dt)), [loop, name, order])
}
