import { forwardRef, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { RapierRigidBody } from '@react-three/rapier'
import { playerState, useGameStore } from '../store/gameStore'
import { playerId } from '../sim/players'
import { dropInX } from '../sim/coop'
import { activePlayerIds, type ScenePlayers } from './scenePlayers'
import { getConfig } from '../content/active'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { interruptMove, stepMoves } from '../sim/moves'
import { holdWeapon, liftableInReach, weaponInReach, weaponMoveset } from '../sim/weapons'
import { dropWeapon, placeWeapon } from './weaponDrops'
import { playSound } from '../audio/engine'
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
  /** Which player: 1 for player 1. Its fighter is `p1` in the scene. */
  slot: number
  /** The scene's players, so this one can drop in beside a partner. */
  players: ScenePlayers
  /** Every fighter's live runtime by name; the player registers under its id (`p1`). */
  runtimes: Map<string, FighterRuntime>
  /** The scrolling view; the player stays on screen. */
  view: StageView
  /** The scene's input; its frame is sampled first in every sim step. */
  input: InputManager
}

/** A player: a FighterBody driven by the scene's input. */
export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ slot, players, runtimes, view, input }, ref) => {
  const id = playerId(slot)
  // Re-render when packs are reinstalled (a Forge playtest edit), so the steps below see the new tuning.
  useGameStore((state) => state.packs)
  const config = getConfig()
  const P = config.player
  const movement = useMemo(
    () => ({ walkSpeed: P.walkSpeed, deceleration: P.deceleration, stopSpeed: config.body.stopSpeed }),
    [P.walkSpeed, P.deceleration, config.body.stopSpeed]
  )
  const [runtime] = useState(createFighterRuntime)
  // Where a partner still in stands (the first other player with a body), for dropping in beside them.
  const partner = () => {
    for (const other of activePlayerIds()) {
      if (other === id || !players.refs.get(other)?.current) continue
      const at = players.positions.get(other)
      if (at) return at
    }
    return null
  }
  // Where the body starts: the level's spawn, beside a partner already there
  // (player 2 at the start of a level, or dropping in mid-level), or mid-screen
  // when coming back after everyone was out.
  const [spawn] = useState((): [number, number, number] => {
    const gap = config.coop.dropInGap
    const at = partner()
    if (at) return [dropInX(at.x, view.cameraX, gap), P.spawnPosition[1], at.z]
    const started = [...players.refs.values()].some((r) => r.current)
    return started ? [view.cameraX, P.spawnPosition[1], 0] : [P.spawnPosition[0] + (slot - 1) * gap, P.spawnPosition[1], P.spawnPosition[2]]
  })
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
  // The grab button this step (for weapons: throw, drop or lift).
  const grabPress = useRef(false)
  // What the HUD last showed for the weapon in hand.
  const shownWeapon = useRef('')
  const respawnSeen = useRef(playerState(useGameStore.getState(), slot)?.respawnCount ?? 0)
  const playerHealth = useGameStore((state) => playerState(state, slot)?.health ?? 0)

  // A Forge "Fight with it" sandbox: start with the weapon in hand.
  useEffect(() => {
    const { sandbox, sandboxWeapon } = useGameStore.getState()
    const def = sandboxWeapon ? getConfig().weapons[sandboxWeapon] : undefined
    if (sandbox && sandboxWeapon && def) runtime.weapon = holdWeapon(sandboxWeapon, def)
  }, [runtime])

  useEffect(() => {
    runtimes.set(id, runtime)
    return () => {
      runtimes.delete(id)
    }
  }, [runtimes, runtime, id])

  // A player out of lives leaves the stage: forget the body, so nothing reads a removed one.
  useEffect(
    () => () => {
      if (ref && typeof ref === 'object') (ref as MutableRefObject<RapierRigidBody | null>).current = null
    },
    [ref]
  )

  // Moves run after the fighter step (so they see this step's intent and
  // facing) and before combat (so combat sees a move on the step it starts).
  // A hit reaction blocks starting moves; combat interrupts a move on hit.
  useSimSystem(`playerAttack:${id}`, SYSTEM_ORDER.playerAttack, (dt) => {
    // Lost a life (or continued): drop back in beside a partner still in, or
    // at the middle of the screen, briefly invulnerable (the body blinks).
    const respawnCount = playerState(useGameStore.getState(), slot)?.respawnCount ?? 0
    if (respawnCount !== respawnSeen.current) {
      respawnSeen.current = respawnCount
      interruptMove(runtime.move)
      runtime.reaction.kind = null
      runtime.reaction.timeLeft = 0
      runtime.reaction.invulnerableLeft = config.rules.respawnInvulnerability
      runtime.velocity = { x: 0, z: 0 }
      const body = (ref as RefObject<RapierRigidBody> | null)?.current
      if (body) {
        const at = partner()
        const x = at ? dropInX(at.x, view.cameraX, config.coop.dropInGap) : view.cameraX
        body.setTranslation({ x, y: P.spawnPosition[1], z: at?.z ?? 0 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
      return
    }
    const intent = runtime.intent
    if (runtime.grounded) airAttackUsed.current = false
    const inAir = !runtime.grounded
    let stepPresses = presses.current
    presses.current = []
    const grabbed = grabPress.current
    grabPress.current = false

    // Weapons: the grab button throws (or, holding down, drops) the one in
    // hand, or lifts a liftable prop in front; attack while standing on one
    // picks it up instead of attacking.
    const body = (ref as RefObject<RapierRigidBody> | null)?.current
    const at = body ? body.translation() : null
    const store = useGameStore.getState()
    // A throw cut short before it let go: the weapon falls where the player stands.
    if (runtime.thrownWeapon && runtime.move.move === null) {
      if (at && runtime.thrownWeapon.returns) placeWeapon(runtime.thrownWeapon.weapon, at)
      runtime.thrownWeapon = null
    }
    const free = runtime.move.move === null && runtime.reaction.kind === null && runtime.grab.target === null && runtime.grounded
    let weaponPress: string | null = null
    let weaponStart: string | null = null
    if (free && at && grabbed) {
      const held = runtime.weapon
      const def = held ? config.weapons[held.id] : undefined
      if (held && def?.throw && direction.current !== 'down') {
        weaponPress = 'grab'
        weaponStart = def.throw.move
        runtime.thrownWeapon = { weapon: held, returns: !!def.throw.returns }
        runtime.weapon = null
      } else if (held) {
        dropWeapon(runtime, at)
      } else {
        const g = config.actions.grab
        const prop = liftableInReach(store.props, config.props, at, runtime.facing.x, runtime.hurtbox.x, config.rules.pickupRadius, g.depthTolerance)
        const lifted = prop && config.props[prop.prop].liftable
        if (prop && lifted && config.weapons[lifted]) {
          store.removeProp(prop.id)
          runtime.weapon = holdWeapon(lifted, config.weapons[lifted])
          playSound(config.audio.pickup)
        }
      }
    }
    if (free && at && !runtime.weapon && !weaponStart && stepPresses.includes('attack')) {
      const item = weaponInReach(store.pickups, config.pickups, at, config.rules.pickupRadius)
      const id = item && config.pickups[item.pickup].weapon
      if (item && id && config.weapons[id]) {
        store.collectPickup(item.id, slot)
        runtime.weapon = holdWeapon(id, config.weapons[id], item.durability)
        playSound(config.audio.pickup)
        stepPresses = stepPresses.filter((p) => p !== 'attack')
      }
    }
    const heldDef = runtime.weapon ? config.weapons[runtime.weapon.id] : undefined
    const moveset = weaponMoveset(heldDef, P.moveset)
    // The weapon's rows come first; the fighter's own keep their indices (for cooldowns).
    const weaponRows = moveset.length - (heldDef?.kind === 'heavy' ? 0 : P.moveset.length)
    const rowKey = (i: number) => i - weaponRows
    // A press while free starts the first moveset trigger it matches; during a
    // move it's buffered for the move's `next` or `branches`.
    let press: string | null = weaponPress
    let trigger: MoveTrigger | null = null
    let index = -1
    if (weaponStart) {
      // The throw starts below, like a trigger's move.
    } else if (runtime.move.move !== null) press = stepPresses[0] ?? null
    else if (runtime.reaction.kind === null && !(inAir && airAttackUsed.current)) {
      const me = playerState(useGameStore.getState(), slot)
      const playerHealth = me?.health ?? 0
      const meter = me?.meter ?? 0
      const ctx = {
        air: inAir,
        running: !!intent?.run,
        blocking: runtime.blocking,
        grabbing: runtime.grab.target !== null,
        direction: direction.current,
        canPay: (t: MoveTrigger, i: number) =>
          (t.cost?.health === undefined || playerHealth > t.cost.health) &&
          (t.cost?.meter === undefined || meter >= t.cost.meter) &&
          (cooldowns.current.get(rowKey(i)) ?? -Infinity) <= loop.time,
      }
      for (const p of stepPresses) {
        index = matchTrigger(moveset, p, ctx)
        if (index >= 0) {
          press = p
          trigger = moveset[index]
          break
        }
      }
    }
    const event = stepMoves(runtime.move, press, dt, config.moves, weaponStart ?? trigger?.move ?? null)
    if (event === 'started' && (weaponStart || trigger)) runtime.weaponMove = !weaponStart && index >= 0 && index < weaponRows
    if (runtime.move.move === null) runtime.weaponMove = false
    if (event === 'started' && trigger) {
      if (trigger.cost?.health) useGameStore.getState().spendHealth(slot, trigger.cost.health)
      if (trigger.cost?.meter) useGameStore.getState().spendMeter(slot, trigger.cost.meter)
      if (trigger.cost?.cooldown) cooldowns.current.set(rowKey(index), loop.time + trigger.cost.cooldown)
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
    // Keep the HUD's weapon in step (picked up, worn, broken, dropped, thrown).
    const w = runtime.weapon
    const shown = w ? `${w.id}:${w.durability}` : ''
    if (shown !== shownWeapon.current) {
      shownWeapon.current = shown
      useGameStore.getState().setPlayerWeapon(slot, w)
    }
  })

  return (
    <FighterBody
      ref={ref}
      name={id}
      position={spawn}
      linearDamping={P.linearDamping}
      movement={movement}
      jumpVelocity={P.jumpVelocity}
      model={slot === 2 ? (config.coop.p2Model ?? P.model) : P.model}
      colliderHalfExtents={P.colliderHalfExtents}
      color={slot === 2 ? config.coop.p2Color : P.color}
      attackingColor="#ff4444"
      health={playerHealth}
      isAttacking={isAttacking}
      getIntent={() => {
        const seat = input.seat(slot)
        const frame = seat.frame
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
        const pointer = slot === 1 ? input.pointerX : null
        const body = (ref as RefObject<RapierRigidBody> | null)?.current
        if (prefs.faceCursor && pointer !== null && body && intent.move.x === 0 && seat.sampler.lastDevice !== 'gamepad') {
          const screenX = (body.translation().x - view.cameraX) / view.halfWidth
          if (Math.abs(pointer - screenX) > 0.02) intent.face = { x: Math.sign(pointer - screenX), z: 0 }
        }
        intent.grab = grabPressed
        // With a weapon in hand (or a liftable prop near), the grab button is for weapons.
        if (frame.pressed.grab) grabPress.current = true
        presses.current = chord.presses
        // Back + attack pressed together: the fighter turns on the first step
        // the direction is held, so judge "away" against the facing before a recent turn.
        if (runtime.facing.x !== turn.current.seen) turn.current = { seen: runtime.facing.x, at: loop.time, from: turn.current.seen }
        const recent = loop.time - turn.current.at <= config.input.turnGrace
        facingBefore.current = recent ? turn.current.from : runtime.facing.x
        direction.current = relativeDirection(intent.move, facingBefore.current)
        return intent
      }}
      isDead={() => (playerState(useGameStore.getState(), slot)?.health ?? 0) <= 0}
      getBounds={() =>
        screenBounds(view, config.stage.depthBand, config.camera.edgeMargin, (ref as RefObject<RapierRigidBody> | null)?.current?.translation().z)
      }
      runtime={runtime}
    />
  )
})
Player.displayName = 'Player'
