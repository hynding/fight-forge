import { forwardRef, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { useControls } from '../hooks/useControls'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { interruptMove, stepMoveRunner } from '../sim/moves'
import { createRunDetector, stepRunDetector } from '../sim/defense'
import { inputIntent } from '../sim/controllers'
import { createFighterRuntime, type FighterRuntime } from '../sim/fighter'
import { screenBounds, type StageView } from '../sim/stage'
import { FighterBody } from './FighterBody'


interface PlayerProps {
  /** Every fighter's live runtime by name; the player registers as "player". */
  runtimes: Map<string, FighterRuntime>
  /** The scrolling view; the player stays on screen. */
  view: StageView
}

/** The player: a FighterBody driven by the keyboard (InputController). */
export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ runtimes, view }, ref) => {
  // Re-render when packs are reinstalled (a Forge playtest edit), so the steps below see the new tuning.
  useGameStore((state) => state.packs)
  const config = getConfig()
  const P = config.player
  const movement = useMemo(
    () => ({ walkSpeed: P.walkSpeed, deceleration: P.deceleration, stopSpeed: config.body.stopSpeed }),
    [P.walkSpeed, P.deceleration, config.body.stopSpeed]
  )
  const controls = useControls()
  const [runtime] = useState(createFighterRuntime)
  // Visual only (attack tint); gameplay reads `runtime.move`.
  const [isAttacking, setIsAttacking] = useState(false)
  const wasAttacking = useRef(false)
  const loop = useSimLoop()
  const [runDetector] = useState(createRunDetector)
  // One air attack per jump.
  const airAttackUsed = useRef(false)
  const respawnSeen = useRef(useGameStore.getState().respawnCount)
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
    // Lost a life (or continued): drop back in at the middle of the screen,
    // briefly invulnerable (the body blinks).
    const { respawnCount } = useGameStore.getState()
    if (respawnCount !== respawnSeen.current) {
      respawnSeen.current = respawnCount
      interruptMove(runtime.move)
      runtime.reaction.kind = null
      runtime.reaction.timeLeft = 0
      runtime.reaction.invulnerableLeft = config.rules.respawnInvulnerability
      runtime.velocity = { x: 0, z: 0 }
      const body = (ref as RefObject<RapierRigidBody> | null)?.current
      if (body) {
        body.setTranslation({ x: view.cameraX, y: P.spawnPosition[1], z: 0 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
      return
    }
    const intent = runtime.intent
    if (runtime.grounded) airAttackUsed.current = false
    const inAir = !runtime.grounded
    // Which move a fresh press starts: in the air, running, or the light combo.
    const first = inAir ? P.jumpAttack : intent?.run ? P.dashAttack : P.lightAttack
    const wants =
      (intent?.attack ?? false) &&
      runtime.reaction.kind === null &&
      !runtime.blocking &&
      !(inAir && airAttackUsed.current)
    const event = stepMoveRunner(runtime.move, wants, dt, config.moves, first)
    if (event === 'started' && inAir) airAttackUsed.current = true
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
      movement={movement}
      jumpVelocity={P.jumpVelocity}
      model={P.model}
      colliderHalfExtents={P.colliderHalfExtents}
      color={P.color}
      attackingColor="#ff4444"
      health={playerHealth}
      isAttacking={isAttacking}
      getIntent={() => {
        const intent = inputIntent(controls)
        intent.run = stepRunDetector(runDetector, intent.move.x, loop.time, config.actions.run)
        return intent
      }}
      isDead={() => useGameStore.getState().playerHealth <= 0}
      getBounds={() =>
        screenBounds(view, config.stage.depthBand, config.camera.edgeMargin)
      }
      runtime={runtime}
    />
  )
})
Player.displayName = 'Player'
