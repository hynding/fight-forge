import { useEffect, useRef } from 'react'
import { padChanges } from '../sim/gamepad'
import { readPad } from './gamepads'

/**
 * While `active`, waits for the next controller button or stick direction
 * pressed (anything already held when capture starts doesn't count) and
 * passes its name to `onInput`.
 */
export const usePadCapture = (active: boolean, onInput: (name: string) => void): void => {
  const latest = useRef(onInput)
  useEffect(() => {
    latest.current = onInput
  })
  useEffect(() => {
    if (!active) return
    let raf = 0
    let prev: Set<string> | null = null
    const tick = () => {
      const { inputs } = readPad()
      if (prev) {
        const [first] = padChanges(prev, inputs).down
        if (first) {
          latest.current(first)
          return
        }
      }
      prev = inputs
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}
