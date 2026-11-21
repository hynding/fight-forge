import { useEffect, useState } from 'react'
import { getBindings } from '../content/bindings'
import { keyMap, normalizeKey, type InputAction } from '../sim/input'
import { useGameStore } from '../store/gameStore'

export interface Controls {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
  block: boolean
  dodge: boolean
}

const INITIAL_CONTROLS: Controls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  attack: false,
  block: false,
  dodge: false,
}

const isControl = (action: InputAction | undefined): action is keyof Controls =>
  action !== undefined && action in INITIAL_CONTROLS

/**
 * The gameplay control a key drives under `map` (from the bindings), if any.
 * Lookups lowercase `KeyboardEvent.key`, so Shift+W and Caps Lock still map.
 */
export const keyToControl = (key: string, map: ReadonlyMap<string, InputAction>): keyof Controls | undefined => {
  const action = map.get(normalizeKey(key))
  return isControl(action) ? action : undefined
}

/** Held state of each gameplay control, from the key bindings in effect when the player mounts. */
export const useControls = () => {
  const [controls, setControls] = useState<Controls>(INITIAL_CONTROLS)

  useEffect(() => {
    const map = keyMap(getBindings())
    const setKey = (e: KeyboardEvent, pressed: boolean) => {
      // The Forge is open over the paused game: keys are typing, not playing.
      if (useGameStore.getState().editing) return
      const control = keyToControl(e.key, map)
      if (!control) return
      e.preventDefault()
      setControls((prev) => (prev[control] === pressed ? prev : { ...prev, [control]: pressed }))
    }

    const handleKeyDown = (e: KeyboardEvent) => setKey(e, true)
    const handleKeyUp = (e: KeyboardEvent) => setKey(e, false)
    // keyup never fires for keys released while the window is unfocused, which
    // would otherwise leave the player running or attacking forever.
    const handleBlur = () => setControls(INITIAL_CONTROLS)

    // Nothing stays held across a trip to the Forge.
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.editing !== prev.editing) setControls(INITIAL_CONTROLS)
    })

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      unsubscribe()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return controls
}
