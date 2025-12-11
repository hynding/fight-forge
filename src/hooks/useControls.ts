import { useEffect, useState } from 'react'

interface Controls {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
  block: boolean
  dodge: boolean
}

export const useControls = () => {
  const [controls, setControls] = useState<Controls>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    attack: false,
    block: false,
    dodge: false,
  })

  useEffect(() => {
    const keyMap: Record<string, keyof Controls> = {
      w: 'forward',
      s: 'backward',
      a: 'left',
      d: 'right',
      ' ': 'jump',
      j: 'attack',
      k: 'block',
      Shift: 'dodge',
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = keyMap[e.key.toLowerCase()]
      if (key) {
        e.preventDefault()
        setControls((prev) => ({ ...prev, [key]: true }))
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = keyMap[e.key.toLowerCase()]
      if (key) {
        e.preventDefault()
        setControls((prev) => ({ ...prev, [key]: false }))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  return controls
}
