import { forwardRef, useState } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useControls } from '../hooks/useControls'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { stepPlayerAttack, type PlayerAttackState } from '../sim/timers'
import { inputIntent } from '../sim/controllers'
import { createFighterRuntime } from '../sim/fighter'
import { screenBounds, type StageView } from '../sim/stage'
import { FighterBody, type AttackVisual } from './FighterBody'

const P = DEFAULT_CONFIG.player
const MOVEMENT = {
  walkSpeed: P.walkSpeed,
  deceleration: P.deceleration,
  stopSpeed: DEFAULT_CONFIG.body.stopSpeed,
}
const ATTACK_VISUAL: AttackVisual = { position: [0, -0.35, -1.2], size: [1.2, 1.5, 0.8], opacity: 0.4 }

interface PlayerProps {
  /** Swing state shared with CombatSystem; the player's sim system writes it. */
  attack: PlayerAttackState
  /** Facing captured when a swing starts; CombatSystem reads it. */
  attackDirectionRef: React.RefObject<Vector3>
  /** The scrolling view; the player stays on screen. */
  view: StageView
}

/** The player: a FighterBody driven by the keyboard (InputController). */
export const Player = forwardRef<RapierRigidBody, PlayerProps>(
  ({ attack, attackDirectionRef, view }, ref) => {
    const controls = useControls()
    const [runtime] = useState(createFighterRuntime)
    // Visual only; gameplay reads the shared `attack` state.
    const [isAttacking, setIsAttacking] = useState(false)
    const playerHealth = useGameStore((state) => state.playerHealth)

    // Swing timers run after the fighter step (so they see this step's intent
    // and facing) and before combat (so combat sees a swing on the step it starts).
    useSimSystem('playerAttack', SYSTEM_ORDER.playerAttack, (dt) => {
      const event = stepPlayerAttack(attack, runtime.intent?.attack ?? false, dt, P.attack)
      if (event === 'started') {
        attackDirectionRef.current?.set(runtime.facing.x, 0, runtime.facing.z)
        setIsAttacking(true)
      } else if (event === 'ended') {
        setIsAttacking(false)
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
        attackVisual={ATTACK_VISUAL}
        health={playerHealth}
        isAttacking={isAttacking}
        getIntent={() => inputIntent(controls)}
        isAttackingNow={() => attack.active}
        isDead={() => useGameStore.getState().playerHealth <= 0}
        getBounds={() =>
          screenBounds(view, DEFAULT_CONFIG.stage.depthBand, DEFAULT_CONFIG.camera.edgeMargin)
        }
        runtime={runtime}
      />
    )
  }
)
Player.displayName = 'Player'
