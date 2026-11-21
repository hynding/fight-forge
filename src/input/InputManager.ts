// The scene's input: device sources feed an ActionSampler (src/sim/actions.ts),
// which the `input` sim system samples once per fixed step. Not React state:
// GameScene owns one per scene, like `runtimes`. Pause and the hitbox toggle
// subscribe to presses directly, since they must work while the sim is frozen.

import { getBindings } from '../content/bindings'
import {
  createActionSampler,
  dropEdges,
  emptyFrame,
  inputDown,
  inputMap,
  inputUp,
  keyInput,
  releaseAll,
  sampleActions,
  type ActionFrame,
  type InputMap,
} from '../sim/actions'
import type { InputAction } from '../sim/input'
import { isFrozen, useGameStore } from '../store/gameStore'

type PressListener = (action: InputAction) => void

export class InputManager {
  readonly sampler = createActionSampler()
  /** The frame sampled by the latest sim step. */
  frame: ActionFrame = emptyFrame()
  private map: InputMap = new Map()
  private listeners = new Set<PressListener>()

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

  /** Starts listening on `target` with the bindings in effect now. Returns the detach function. */
  attach(target: Window): () => void {
    this.map = inputMap(getBindings())
    const editing = () => useGameStore.getState().editing

    const onKeyDown = (e: KeyboardEvent) => {
      // The Forge is open over the paused game: keys are typing, not playing.
      if (editing()) return
      const input = keyInput(e.key)
      const action = this.map.get(input)
      if (!action) return
      e.preventDefault()
      if (e.repeat || this.sampler.down.has(input)) return
      inputDown(this.sampler, input, 'keyboard')
      for (const fn of this.listeners) fn(action)
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
      // A press made while paused doesn't fire on resume.
      else if (isFrozen(s) !== isFrozen(prev)) dropEdges(this.sampler)
    })

    target.addEventListener('keydown', onKeyDown)
    target.addEventListener('keyup', onKeyUp)
    target.addEventListener('blur', onBlur)
    return () => {
      unsubscribe()
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      releaseAll(this.sampler)
    }
  }
}
