import { forwardRef, useEffect, useRef, useState } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { useControls } from '../hooks/useControls'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { stepMoveRunner } from '../sim/moves'
import { inputIntent } from '../sim/controllers'
import { createFighterRuntime, type FighterRuntime } from '../sim/fighter'
import { screenBounds, type StageView } from '../sim/stage'
import { FighterBody } from './FighterBody'

const P = DEFAULT_CONFIG.player
const MOVEMENT = {
  walkSpeed: P.walkSpeed,
  deceleration: P.deceleration,
  stopSpeed: DEFAULT_CONFIG.body.stopSpeed,
}

interface PlayerProps {
  /** Every fighter's live runtime by name; the player registers as "player". */
  runtimes: Map<string, FighterRuntime>
  /** The scrolling view; the player stays on screen. */
  view: StageView
}

/** The player: a FighterBody driven by the keyboard (InputController). */
export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ runtimes, view }, ref) => {
  const controls = useControls()
  const [runtime] = useState(createFighterRuntime)
  // Visual only (attack tint); gameplay reads `runtime.move`.
  const [isAttacking, setIsAttacking] = useState(false)
  const wasAttacking = useRef(false)
  const playerHealth = useGameStore((state) => state.playerHealth)

  useEffect(() => {
    runtimes.set('player', runtime)
    return () => {
      runtimes.delete('player')
    }
  }, [runtimes, runtime])

  // Moves run after the fighter step (so they see this step's intent and
  // facing) and before combat (so combat sees a move on the step it starts).
  // A hit reaction blocks starting moves; combat interrupts a move on hit.
  useSimSystem('playerAttack', SYSTEM_ORDER.playerAttack, (dt) => {
    const wants = (runtime.intent?.attack ?? false) && runtime.reaction.kind === null
    stepMoveRunner(runtime.move, wants, dt, DEFAULT_CONFIG.moves, P.lightAttack)
    // Also catches a move that combat interrupted.
    const attacking = runtime.move.move !== null
    if (attacking !== wasAttacking.current) {
      wasAttacking.current = attacking
      setIsAttacking(attacking)
    }
  })

  return (
    <FighterBody
      ref={ref}
      name="player"
      position={P.spawnPosition}
      linearDamping={P.linearDamping}
      movement={MOVEMENT}
      jumpVelocity={P.jumpVelocity}
      model={P.model}
      colliderHalfExtents={P.colliderHalfExtents}
      color={P.color}
      attackingColor="#ff4444"
      health={playerHealth}
      isAttacking={isAttacking}
      getIntent={() => inputIntent(controls)}
      isDead={() => useGameStore.getState().playerHealth <= 0}
      getBounds={() =>
        screenBounds(view, DEFAULT_CONFIG.stage.depthBand, DEFAULT_CONFIG.camera.edgeMargin)
      }
      runtime={runtime}
    />
  )
})
Player.displayName = 'Player'
