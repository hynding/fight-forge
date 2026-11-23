// The scene's input: device sources (keyboard, the mouse over the game view,
// and the gamepads, polled every animation frame) feed one ActionSampler per
// player (src/sim/actions.ts), which the `input` sim system samples once per
// fixed step. Player 1 has the keyboard map, the mouse and the first pad;
// player 2 has the second keyboard map (which then takes its keys from
// player 1) or the pad they joined with, and joins by pressing attack or
// start on one (src/sim/coop.ts). Not React state: GameScene owns one per
// scene, like `runtimes`. Pause and the hitbox toggle subscribe to presses
// directly, since they must work while the sim is frozen.

import { getBindings, getKeyboard2 } from '../content/bindings'
import { getConfig } from '../content/active'
import { padChanges, padInputs, padStick } from '../sim/gamepad'
import { activePadIndex, allPads, playerPad, readPad, readPadAt, setPlayer2Pad, type PadRead } from './gamepads'
import { loadControlPrefs } from './prefs'
import {
  createActionSampler,
  emptyFrame,
  inputDown,
  inputMap,
  inputUp,
  keyInput,
  releaseAll,
  sampleActions,
  suppressHeld,
  type ActionFrame,
  type ActionSampler,
  type InputMap,
} from '../sim/actions'
import { JOIN_ACTIONS, keyboard2Map, padSeat, routeKey, withoutInputs } from '../sim/coop'
import { MOUSE_BUTTONS, inputName, type InputAction, type InputDevice } from '../sim/input'
import { isFrozen, playerState, useGameStore } from '../store/gameStore'

type PressListener = (action: InputAction, slot: number) => void

/** One player's controls: their sampler, its latest frame and the inputs that are theirs. */
export class PlayerInput {
  readonly sampler = createActionSampler()
  frame: ActionFrame = emptyFrame()
  map: InputMap = new Map()
  /** Pad inputs down at the last poll. */
  padDown = new Set<string>()
}

const isPlayer2On = (controls: 'keyboard2' | 'gamepad'): boolean => {
  const p2 = playerState(useGameStore.getState(), 2)
  return !!p2 && p2.lives > 0 && p2.controls === controls
}

export class InputManager {
  /** Each player's controls, by slot. */
  readonly seats = new Map<number, PlayerInput>([
    [1, new PlayerInput()],
    [2, new PlayerInput()],
  ])
  /** The mouse's X over the game view, -1 (left edge) to 1 (right edge); null when off it. */
  pointerX: number | null = null
  private listeners = new Set<PressListener>()
  /** Every device's bindings (player 1's, and player 2's pad buttons). */
  private full: InputMap = new Map()
  /** Player 2's keyboard map. */
  private keys2: InputMap = new Map()
  /** Pad inputs down at the last poll, for pads nobody has yet. */
  private idleDown = new Map<number, Set<string>>()

  /** A player's controls. */
  seat(slot: number): PlayerInput {
    let seat = this.seats.get(slot)
    if (!seat) {
      seat = new PlayerInput()
      this.seats.set(slot, seat)
    }
    return seat
  }

  /** Player 1's sampler. */
  get sampler(): ActionSampler {
    return this.seat(1).sampler
  }

  /** Player 1's frame from the latest sim step. */
  get frame(): ActionFrame {
    return this.seat(1).frame
  }

  /** Samples this step's frame for every player. Called by the `input` sim system, first in the step. */
  step(): void {
    for (const seat of this.seats.values()) seat.frame = sampleActions(seat.sampler, seat.map)
  }

  /** Calls `fn` the moment a bound input is pressed (not on key repeat), frozen or not, with whose press it was. */
  onPress(fn: PressListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Works out whose inputs are whose from the bindings and who is playing on
   * what: while player 2 is on the second keyboard map, its keys leave
   * player 1's map (and anything player 1 was holding on them is let go).
   */
  private remap(): void {
    const onKeys = isPlayer2On('keyboard2')
    const p1 = this.seat(1)
    p1.map = onKeys ? withoutInputs(this.full, this.keys2) : this.full
    for (const input of [...p1.sampler.down]) if (!p1.map.has(input)) inputUp(p1.sampler, input)
    const pads = [...this.full].filter(([input]) => input.startsWith('pad:'))
    this.seat(2).map = new Map([...this.keys2, ...pads])
  }

  private rebuild(): void {
    this.full = inputMap(getBindings())
    this.keys2 = keyboard2Map(getKeyboard2())
    this.remap()
  }

  /** A bound input went down for player `slot`: latch it and tell the press listeners. Returns whether it's bound. */
  private press(slot: number, input: string, device: InputDevice): boolean {
    const seat = this.seat(slot)
    const action = seat.map.get(input)
    if (!action) return false
    if (seat.sampler.down.has(input)) return true
    inputDown(seat.sampler, input, device)
    if (slot === 1 && device !== 'gamepad') useGameStore.getState().setInputDevice(device)
    for (const fn of this.listeners) fn(action, slot)
    return true
  }

  /** Player 2 asks to join (or rejoin on a continue) with these controls. */
  private join(controls: 'keyboard2' | 'gamepad', pad: number | null): boolean {
    if (!useGameStore.getState().joinPlayer(2, controls)) return false
    setPlayer2Pad(pad)
    releaseAll(this.seat(2).sampler)
    this.remap()
    return true
  }

  /** Feeds one pad's button edges and stick into a player's sampler. */
  private feedPad(slot: number, { pad, inputs }: PadRead): void {
    const seat = this.seat(slot)
    const { down, up } = padChanges(seat.padDown, inputs)
    for (const name of up) inputUp(seat.sampler, inputName('gamepad', name))
    for (const name of down) this.press(slot, inputName('gamepad', name), 'gamepad')
    seat.padDown = inputs
    const deadZone = loadControlPrefs().deadZone ?? getConfig().input.analog.deadZone
    seat.sampler.stick = pad ? padStick(pad, deadZone) : { x: 0, z: 0 }
  }

  /** The actions a pad's newly pressed inputs are bound to. */
  private padActions(names: readonly string[]): InputAction[] {
    return names.flatMap((n) => this.full.get(inputName('gamepad', n)) ?? [])
  }

  /** Reads the pads: player 1's, player 2's, and any other pad pressing to join. */
  private pollPads(): void {
    const store = useGameStore.getState()
    const none: PadRead = { pad: null, inputs: new Set() }
    if (store.editing) {
      this.feedPad(1, none)
      this.feedPad(2, none)
      return
    }
    const p2 = playerState(store, 2)
    const p2In = !!p2 && p2.lives > 0
    const p2Index = playerPad(2)
    const seats = { p1: activePadIndex(), p2: p2Index, p2Free: !p2In, expected: store.expectedPlayers }

    // Pads nobody has: attack or start joins as player 2.
    for (const pad of allPads()) {
      if (!pad || pad.connected === false || pad.index === seats.p1 || pad.index === p2Index) continue
      const inputs = padInputs(pad)
      const { down } = padChanges(this.idleDown.get(pad.index) ?? new Set(), inputs)
      this.idleDown.set(pad.index, inputs)
      if (padSeat(pad.index, this.padActions(down), seats) === 'join' && this.join('gamepad', pad.index)) {
        // What's down now (the join press) doesn't also attack.
        this.seat(2).padDown = inputs
        return
      }
    }

    // Player 1's pad: the first used, unless the menu chose two players and player 2 hasn't joined.
    const waitForP2 = seats.p1 === null && seats.expected >= 2 && !p2In
    this.feedPad(1, waitForP2 ? none : readPad())

    // Player 2's pad: theirs while they're in; attack or start brings them back on a continue.
    if (p2Index === null || p2?.controls !== 'gamepad') return this.feedPad(2, none)
    const read = readPadAt(p2Index)
    if (p2In) return this.feedPad(2, read)
    const seat = this.seat(2)
    const { down } = padChanges(seat.padDown, read.inputs)
    seat.padDown = read.inputs
    if (this.padActions(down).some((a) => JOIN_ACTIONS.includes(a))) this.join('gamepad', p2Index)
  }

  /**
   * Starts listening on `target` with the bindings in effect now. Mouse
   * buttons and the wheel count only over `view()` (the game's canvas), so
   * clicking a menu button never attacks. Returns the detach function.
   */
  attach(target: Window, view: () => Element | null = () => null): () => void {
    this.rebuild()
    const editing = () => useGameStore.getState().editing
    const overView = (e: Event) => e.target !== null && e.target === view()
    const all = () => [...this.seats.values()].map((s) => s.sampler)

    const onKeyDown = (e: KeyboardEvent) => {
      // The Forge is open over the paused game: keys are typing, not playing.
      if (editing()) return
      const input = keyInput(e.key)
      const who = routeKey(input, this.seat(1).map, this.keys2, isPlayer2On('keyboard2'))
      if (who === null) return
      e.preventDefault()
      if (e.repeat) return
      if (who === 'join') this.join('keyboard2', null)
      else this.press(who, input, 'keyboard')
    }
    const onMouseDown = (e: MouseEvent) => {
      const button = MOUSE_BUTTONS[e.button]
      if (editing() || !button || !overView(e)) return
      if (this.press(1, inputName('mouse', button), 'mouse')) e.preventDefault()
    }
    // Released anywhere, so a drag off the canvas doesn't leave a button held.
    const onMouseUp = (e: MouseEvent) => {
      const button = MOUSE_BUTTONS[e.button]
      if (button) inputUp(this.sampler, inputName('mouse', button))
    }
    // A wheel notch is a tap: down and up before the next step, which still counts as one press.
    const onWheel = (e: WheelEvent) => {
      if (editing() || e.deltaY === 0 || !overView(e)) return
      const input = inputName('mouse', e.deltaY < 0 ? 'wheelup' : 'wheeldown')
      if (!this.press(1, input, 'mouse')) return
      e.preventDefault()
      inputUp(this.sampler, input)
    }
    // The right button can be bound, so no context menu over the game.
    const onContextMenu = (e: MouseEvent) => {
      if (overView(e)) e.preventDefault()
    }
    // For "face the cursor".
    const onMouseMove = (e: MouseEvent) => {
      const el = view()
      if (!el || !overView(e)) {
        this.pointerX = null
        return
      }
      const rect = el.getBoundingClientRect()
      this.pointerX = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 2 - 1 : null
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (editing()) return
      const input = keyInput(e.key)
      if (!this.full.has(input) && !this.keys2.has(input)) return
      e.preventDefault()
      for (const s of all()) inputUp(s, input)
    }
    // keyup never fires for keys released while the window is unfocused, which
    // would otherwise leave the player running or attacking forever.
    const onBlur = () => all().forEach(releaseAll)
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      // Packs reinstalled (a Forge playtest edit may have changed the keys).
      if (s.packs !== prev.packs) this.rebuild()
      // Player 2 joined, left or ran out: the keyboard split may change.
      else if (s.players !== prev.players) this.remap()
      // Nothing stays held across a trip to the Forge.
      if (s.editing !== prev.editing) all().forEach(releaseAll)
      // A press made while paused doesn't fire on resume, and a button held
      // through it (A on RESUME) waits to be released.
      else if (isFrozen(s) !== isFrozen(prev)) all().forEach(suppressHeld)
    })

    // Pads have no events for buttons: poll them every frame, frozen or not (Start unpauses).
    let frame = 0
    const tick = () => {
      this.pollPads()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // A controller in use went away mid-fight: pause.
    const onPadGone = (e: Event) => {
      const index = (e as GamepadEvent).gamepad?.index
      const st = useGameStore.getState()
      if (isFrozen(st)) return
      const p1Gone = index === activePadIndex() && st.inputDevice === 'gamepad'
      const p2Gone = index === playerPad(2) && isPlayer2On('gamepad')
      if (p1Gone || p2Gone) st.togglePause()
    }

    target.addEventListener('keydown', onKeyDown)
    target.addEventListener('keyup', onKeyUp)
    target.addEventListener('blur', onBlur)
    target.addEventListener('mousedown', onMouseDown)
    target.addEventListener('mouseup', onMouseUp)
    target.addEventListener('wheel', onWheel, { passive: false })
    target.addEventListener('contextmenu', onContextMenu)
    target.addEventListener('mousemove', onMouseMove)
    target.addEventListener('gamepaddisconnected', onPadGone)
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
      target.removeEventListener('gamepaddisconnected', onPadGone)
      for (const seat of this.seats.values()) seat.padDown = new Set()
      this.idleDown.clear()
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      target.removeEventListener('mousedown', onMouseDown)
      target.removeEventListener('mouseup', onMouseUp)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('contextmenu', onContextMenu)
      target.removeEventListener('mousemove', onMouseMove)
      this.pointerX = null
      all().forEach(releaseAll)
    }
  }
}
