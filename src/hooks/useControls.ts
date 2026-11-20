import { useEffect, useState } from 'react'

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

// Keys are lowercase because lookups lowercase `KeyboardEvent.key`
// (so Shift+W and Caps Lock still map to `forward`).
const KEY_MAP: Record<string, keyof Controls> = {
  w: 'forward',
  s: 'backward',
  a: 'left',
  d: 'right',
  ' ': 'jump',
  j: 'attack',
  k: 'block',
  shift: 'dodge',
}

export const keyToControl = (key: string): keyof Controls | undefined =>
  KEY_MAP[key.toLowerCase()]

export const useControls = () => {
  const [controls, setControls] = useState<Controls>(INITIAL_CONTROLS)

  useEffect(() => {
    const setKey = (e: KeyboardEvent, pressed: boolean) => {
      const control = keyToControl(e.key)
      if (!control) return
      e.preventDefault()
      setControls((prev) => (prev[control] === pressed ? prev : { ...prev, [control]: pressed }))
    }

    const handleKeyDown = (e: KeyboardEvent) => setKey(e, true)
    const handleKeyUp = (e: KeyboardEvent) => setKey(e, false)
    // keyup never fires for keys released while the window is unfocused, which
    // would otherwise leave the player running or attacking forever.
    const handleBlur = () => setControls(INITIAL_CONTROLS)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return controls
}
