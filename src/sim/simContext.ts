import { createContext, useContext, useEffect, useRef } from 'react'
import type { ModelBudget } from './budget'
import type { SimLoop, SystemStep } from './loop'
import type { FeelState } from './feel'

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

/** The scene's game-feel state (hit-stop, shake, effects); see `sim/feel.ts`. */
export const FeelContext = createContext<FeelState | null>(null)

export const useFeel = (): FeelState => {
  const feel = useContext(FeelContext)
  if (!feel) throw new Error('useFeel must be used inside <SimLoopDriver>')
  return feel
}

/** True during a hit-stop, when physics pauses with the sim. */
export const HitStopContext = createContext(false)

/** The scene's detail budget for skinned models (`sim/budget.ts`); none outside a game scene (full detail). */
export const ModelBudgetContext = createContext<ModelBudget | null>(null)

export const useModelBudget = (): ModelBudget | null => useContext(ModelBudgetContext)
