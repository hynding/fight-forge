// The scene's input: device sources (keyboard, the mouse over the game view,
// and player 1's gamepad, polled every animation frame) feed an ActionSampler
// (src/sim/actions.ts), which the `input` sim system samples once per fixed step. Not React state:
// GameScene owns one per scene, like `runtimes`. Pause and the hitbox toggle
// subscribe to presses directly, since they must work while the sim is frozen.

import { getBindings } from '../content/bindings'
import { getConfig } from '../content/active'
import { padChanges, padStick } from '../sim/gamepad'
import { activePadIndex, readPad } from './gamepads'
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
  type InputMap,
} from '../sim/actions'
import { MOUSE_BUTTONS, inputName, type InputAction, type InputDevice } from '../sim/input'
import { isFrozen, useGameStore } from '../store/gameStore'

type PressListener = (action: InputAction) => void

export class InputManager {
  readonly sampler = createActionSampler()
  /** The frame sampled by the latest sim step. */
  frame: ActionFrame = emptyFrame()
  /** The mouse's X over the game view, -1 (left edge) to 1 (right edge); null when off it. */
  pointerX: number | null = null
  private map: InputMap = new Map()
  private listeners = new Set<PressListener>()
  /** Pad inputs down at the last poll. */
  private padDown = new Set<string>()

  /** Samples this step's frame. Called by the `input` sim system, first in the step. */
  step(): ActionFrame {
    this.frame = sampleActions(this.sampler, this.map)
    return this.frame
  }

  /** Calls `fn` the moment a bound input is pressed (not on key repeat), frozen or not. */
  onPress(fn: PressListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** A bound input went down: latch it and tell the press listeners. Returns whether it's bound. */
  private press(input: string, device: InputDevice): boolean {
    const action = this.map.get(input)
    if (!action) return false
    if (this.sampler.down.has(input)) return true
    inputDown(this.sampler, input, device)
    if (device !== 'gamepad') useGameStore.getState().setInputDevice(device)
    for (const fn of this.listeners) fn(action)
    return true
  }

  /** Reads player 1's pad: button edges into the sampler, the left stick as the analog move. */
  private pollPad(): void {
    const editing = useGameStore.getState().editing
    const { pad, inputs } = editing ? { pad: null, inputs: new Set<string>() } : readPad()
    const { down, up } = padChanges(this.padDown, inputs)
    for (const name of up) inputUp(this.sampler, inputName('gamepad', name))
    for (const name of down) this.press(inputName('gamepad', name), 'gamepad')
    this.padDown = inputs
    const deadZone = loadControlPrefs().deadZone ?? getConfig().input.analog.deadZone
    this.sampler.stick = pad ? padStick(pad, deadZone) : { x: 0, z: 0 }
  }

  /**
   * Starts listening on `target` with the bindings in effect now. Mouse
   * buttons and the wheel count only over `view()` (the game's canvas), so
   * clicking a menu button never attacks. Returns the detach function.
   */
  attach(target: Window, view: () => Element | null = () => null): () => void {
    this.map = inputMap(getBindings())
    const editing = () => useGameStore.getState().editing
    const overView = (e: Event) => e.target !== null && e.target === view()

    const onKeyDown = (e: KeyboardEvent) => {
      // The Forge is open over the paused game: keys are typing, not playing.
      if (editing()) return
      const input = keyInput(e.key)
      if (!this.map.has(input)) return
      e.preventDefault()
      if (!e.repeat) this.press(input, 'keyboard')
    }
    const onMouseDown = (e: MouseEvent) => {
      const button = MOUSE_BUTTONS[e.button]
      if (editing() || !button || !overView(e)) return
      if (this.press(inputName('mouse', button), 'mouse')) e.preventDefault()
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
      if (!this.press(input, 'mouse')) return
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
      if (!this.map.has(input)) return
      e.preventDefault()
      inputUp(this.sampler, input)
    }
    // keyup never fires for keys released while the window is unfocused, which
    // would otherwise leave the player running or attacking forever.
    const onBlur = () => releaseAll(this.sampler)
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      // Packs reinstalled (a Forge playtest edit may have changed the keys).
      if (s.packs !== prev.packs) this.map = inputMap(getBindings())
      // Nothing stays held across a trip to the Forge.
      if (s.editing !== prev.editing) releaseAll(this.sampler)
      // A press made while paused doesn't fire on resume, and a button held
      // through it (A on RESUME) waits to be released.
      else if (isFrozen(s) !== isFrozen(prev)) suppressHeld(this.sampler)
    })

    // Pads have no events for buttons: poll them every frame, frozen or not (Start unpauses).
    let frame = 0
    const tick = () => {
      this.pollPad()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // The controller in use went away mid-fight: pause.
    const onPadGone = (e: Event) => {
      const index = (e as GamepadEvent).gamepad?.index
      const st = useGameStore.getState()
      if (index === activePadIndex() && st.inputDevice === 'gamepad' && !isFrozen(st)) st.togglePause()
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
      this.padDown = new Set()
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      target.removeEventListener('mousedown', onMouseDown)
      target.removeEventListener('mouseup', onMouseUp)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('contextmenu', onContextMenu)
      target.removeEventListener('mousemove', onMouseMove)
      this.pointerX = null
      releaseAll(this.sampler)
    }
  }
}
