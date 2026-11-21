import { forwardRef, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { interruptMove, stepMoves } from '../sim/moves'
import { createChordBuffer, matchTrigger, MOVESET_ACTIONS, relativeDirection, stepChords, type Direction, type MoveTrigger } from '../sim/moveset'
import { createRunDetector, stepRunDetector } from '../sim/defense'
import { inputIntent } from '../sim/controllers'
import { frameControls } from '../sim/actions'
import { actionEnabled } from '../sim/input'
import { loadControlPrefs } from '../input/prefs'
import type { InputManager } from '../input/InputManager'
import { createFighterRuntime, type FighterRuntime } from '../sim/fighter'
import { screenBounds, type StageView } from '../sim/stage'
import { FighterBody } from './FighterBody'


interface PlayerProps {
  /** Every fighter's live runtime by name; the player registers as "player". */
  runtimes: Map<string, FighterRuntime>
  /** The scrolling view; the player stays on screen. */
  view: StageView
  /** The scene's input; its frame is sampled first in every sim step. */
  input: InputManager
}

/** The player: a FighterBody driven by the scene's input. */
export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ runtimes, view, input }, ref) => {
  // Re-render when packs are reinstalled (a Forge playtest edit), so the steps below see the new tuning.
  useGameStore((state) => state.packs)
  const config = getConfig()
  const P = config.player
  const movement = useMemo(
    () => ({ walkSpeed: P.walkSpeed, deceleration: P.deceleration, stopSpeed: config.body.stopSpeed }),
    [P.walkSpeed, P.deceleration, config.body.stopSpeed]
  )
  const [runtime] = useState(createFighterRuntime)
  // Visual only (attack tint); gameplay reads `runtime.move`.
  const [isAttacking, setIsAttacking] = useState(false)
  const wasAttacking = useRef(false)
  const loop = useSimLoop()
  const [runDetector] = useState(createRunDetector)
  // One air attack per jump.
  const airAttackUsed = useRef(false)
  // Moveset input, worked out in the fighter step (before it turns) and used by the attack system.
  const [chords] = useState(createChordBuffer)
  const presses = useRef<string[]>([])
  const direction = useRef<Direction | null>(null)
  const facingBefore = useRef(1)
  // When the fighter last turned round, and which way it faced before.
  const turn = useRef({ seen: 1, at: -Infinity, from: 1 })
  // Game time each trigger (by index) can fire again.
  const cooldowns = useRef(new Map<number, number>())
  // Toggle block: whether the guard is up.
  const blockOn = useRef(false)
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
    const stepPresses = presses.current
    presses.current = []
    // A press while free starts the first moveset trigger it matches; during a
    // move it's buffered for the move's `next` or `branches`.
    let press: string | null = null
    let trigger: MoveTrigger | null = null
    let index = -1
    if (runtime.move.move !== null) press = stepPresses[0] ?? null
    else if (runtime.reaction.kind === null && !(inAir && airAttackUsed.current)) {
      const { playerHealth, meter } = useGameStore.getState()
      const ctx = {
        air: inAir,
        running: !!intent?.run,
        blocking: runtime.blocking,
        grabbing: runtime.grab.target !== null,
        direction: direction.current,
        canPay: (t: MoveTrigger, i: number) =>
          (t.cost?.health === undefined || playerHealth > t.cost.health) &&
          (t.cost?.meter === undefined || meter >= t.cost.meter) &&
          (cooldowns.current.get(i) ?? -Infinity) <= loop.time,
      }
      for (const p of stepPresses) {
        index = matchTrigger(P.moveset, p, ctx)
        if (index >= 0) {
          press = p
          trigger = P.moveset[index]
          break
        }
      }
    }
    const event = stepMoves(runtime.move, press, dt, config.moves, trigger?.move ?? null)
    if (event === 'started' && trigger) {
      if (trigger.cost?.health) useGameStore.getState().spendHealth(trigger.cost.health)
      if (trigger.cost?.meter) useGameStore.getState().spendMeter(trigger.cost.meter)
      if (trigger.cost?.cooldown) cooldowns.current.set(index, loop.time + trigger.cost.cooldown)
      // A move for "away" comes out behind without turning round.
      if (trigger.direction === 'away') runtime.facing.x = facingBefore.current
    }
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
        const frame = input.frame
        const actions = config.input.actions
        const prefs = loadControlPrefs()
        const controls = frameControls(frame)
        // Actions the pack turned off do nothing, even if an old binding remains.
        for (const a of ['heavy', 'special'] as const) if (!actionEnabled(actions, a)) controls[a] = false
        const grabPressed = !!frame.pressed.grab && actionEnabled(actions, 'grab')
        // Toggle block: a press raises or lowers the guard.
        if (actions.block.mode === 'toggle' || prefs.toggleBlock) {
          if (frame.pressed.block) blockOn.current = !blockOn.current
          controls.block = blockOn.current
        } else blockOn.current = false
        // Actions in a chord wait briefly to see if the chord completes.
        const chord = stepChords(
          chords,
          new Set(MOVESET_ACTIONS.filter((a) => frame.pressed[a])),
          new Set(MOVESET_ACTIONS.filter((a) => frame.held[a])),
          loop.time,
          config.input.chordWindow,
          P.moveset
        )
        for (const a of chord.hidden) controls[a] = false
        for (const a of chord.tapped) controls[a] = true
        const intent = inputIntent(controls)
        // A stick walks at its tilt and runs when pushed past the threshold.
        if (frame.analog) intent.move = frame.move
        const pushed = frame.analog && Math.hypot(frame.move.x, frame.move.z) >= config.input.analog.runThreshold
        const runMode = actions.run.mode
        const tapped = stepRunDetector(runDetector, intent.move.x, loop.time, config.actions.run)
        const held = controls.run && intent.move.x !== 0
        intent.run = (runMode !== 'hold' && tapped) || (runMode !== 'doubleTap' && held) || pushed
        // Face the cursor: standing still with the mouse in use, turn toward the pointer.
        const pointer = input.pointerX
        const body = (ref as RefObject<RapierRigidBody> | null)?.current
        if (prefs.faceCursor && pointer !== null && body && intent.move.x === 0 && input.sampler.lastDevice !== 'gamepad') {
          const screenX = (body.translation().x - view.cameraX) / view.halfWidth
          if (Math.abs(pointer - screenX) > 0.02) intent.face = { x: Math.sign(pointer - screenX), z: 0 }
        }
        intent.grab = grabPressed
        presses.current = chord.presses
        // Back + attack pressed together: the fighter turns on the first step
        // the direction is held, so judge "away" against the facing before a recent turn.
        if (runtime.facing.x !== turn.current.seen) turn.current = { seen: runtime.facing.x, at: loop.time, from: turn.current.seen }
        const recent = loop.time - turn.current.at <= config.input.turnGrace
        facingBefore.current = recent ? turn.current.from : runtime.facing.x
        direction.current = relativeDirection(intent.move, facingBefore.current)
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
