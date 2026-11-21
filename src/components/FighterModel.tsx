import { Suspense, type RefObject } from 'react'
import { isFrozen, useGameStore } from '../store/gameStore'
import { PROCEDURAL_MODEL, type ModelRef } from '../config/defaults'
import type { FighterRuntime } from '../sim/fighter'
import { HumanoidModel } from './HumanoidModel'
import { GltfModel } from './GltfModel'
import { ModelErrorBoundary } from './ModelErrorBoundary'

interface FighterModelProps {
  model: ModelRef
  color: string
  emissive: string
  emissiveIntensity: number
  scale: number
  runtime: FighterRuntime
  /** The fighter's name (for the model detail budget). */
  name?: string
  /** Used by the procedural humanoid's walk cycle. */
  animationTimeRef: RefObject<number>
  isMovingRef: RefObject<boolean>
}

const frozenNow = () => isFrozen(useGameStore.getState())

/**
 * A fighter's look: an imported glTF when configured, else the box humanoid.
 * The humanoid also stands in while a glTF loads and if it fails to load.
 */
export const FighterModel = ({ model, ...props }: FighterModelProps) => {
  const humanoid = <Humanoid {...props} offset={PROCEDURAL_MODEL.offset} />

  if (model.kind === 'procedural') return <Humanoid {...props} offset={model.offset} />

  return (
    <ModelErrorBoundary label={model.url} fallback={humanoid}>
      <Suspense fallback={humanoid}>
        <GltfModel
          model={model}
          color={props.color}
          emissive={props.emissive}
          emissiveIntensity={props.emissiveIntensity}
          scale={props.scale}
          runtime={props.runtime}
          paused={frozenNow}
          name={props.name}
        />
      </Suspense>
    </ModelErrorBoundary>
  )
}

const Humanoid = ({
  offset,
  scale,
  color,
  emissive,
  emissiveIntensity,
  animationTimeRef,
  isMovingRef,
}: Omit<FighterModelProps, 'model' | 'runtime' | 'name'> & { offset: [number, number, number] }) => (
  <group position={[offset[0] * scale, offset[1] * scale, offset[2] * scale]}>
    <HumanoidModel
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      scale={scale}
      animationTimeRef={animationTimeRef}
      isMovingRef={isMovingRef}
    />
  </group>
)
