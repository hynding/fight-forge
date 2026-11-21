import { useEffect } from 'react'
import { isFrozen, useGameStore } from '../store/gameStore'
import { readPad } from '../input/gamepads'
import { padChanges } from '../sim/gamepad'
import { nearestTo, nextFocus, padDirection, stepRepeat, type NavDir, type Repeat } from '../input/menuNav'

const FOCUSABLE = 'button, [role=tab], select, input, a[href]'

/** The controls a person could click now: enabled, visible and not covered by an overlay. */
const focusables = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const cx = Math.min(window.innerWidth - 1, Math.max(0, r.x + r.width / 2))
    const cy = Math.min(window.innerHeight - 1, Math.max(0, r.y + r.height / 2))
    const top = document.elementFromPoint(cx, cy)
    return !!top && (top === el || el.contains(top) || top.contains(el))
  })

const markFocus = (el: HTMLElement | null) => {
  document.querySelectorAll('[data-pad-focus]').forEach((e) => e.removeAttribute('data-pad-focus'))
  if (!el) return
  el.setAttribute('data-pad-focus', '')
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Where menus are on screen: everywhere but the Forge, and over the game only while it's frozen. */
const menusUp = (): boolean => {
  const s = useGameStore.getState()
  if (s.gameScreen === 'forge' || s.editing || s.gameScreen === 'loading') return false
  return s.gameScreen !== 'playing' || isFrozen(s)
}

/**
 * Menu navigation with a controller: the d-pad or left stick moves focus
 * between the buttons on screen, A presses the focused one, B goes back
 * (resumes from pause). Also notes keyboard and mouse use, so prompts show
 * the right buttons. Renders nothing.
 */
export const MenuPad = () => {
  useEffect(() => {
    let raf = 0
    let prev = new Set<string>()
    let wasUp = false
    const repeat: Repeat = { dir: null, next: 0 }

    const move = (dir: NavDir) => {
      const items = focusables()
      if (!items.length) return
      const rects = items.map((el) => el.getBoundingClientRect())
      const current = items.indexOf(document.activeElement as HTMLElement)
      const next = current < 0 ? nearestTo(rects, window.innerWidth / 2, window.innerHeight / 2) : nextFocus(rects, current, dir)
      markFocus(items[next])
    }
    const press = () => {
      const items = focusables()
      const el = document.activeElement as HTMLElement | null
      if (el && items.includes(el)) el.click()
      else move('down')
    }
    const back = () => {
      const s = useGameStore.getState()
      if (s.gameScreen === 'playing' && s.isPaused) s.togglePause()
      else focusables().find((el) => el.hasAttribute('data-menu-back'))?.click()
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const up = menusUp()
      if (!up) {
        wasUp = false
        return
      }
      const { inputs } = readPad()
      // Buttons already held when a menu appears (jumping as the level ends) don't act on it.
      if (!wasUp) {
        wasUp = true
        prev = inputs
        repeat.dir = null
        return
      }
      const { down } = padChanges(prev, inputs)
      prev = inputs
      const dir = stepRepeat(repeat, padDirection(inputs), now / 1000)
      if (dir) move(dir)
      if (down.includes('a')) press()
      if (down.includes('b')) back()
    }
    raf = requestAnimationFrame(tick)

    // Keyboard or mouse use: prompts go back to keys, and the controller's focus ring goes away.
    const onKey = () => useGameStore.getState().setInputDevice('keyboard')
    const onMouse = () => {
      useGameStore.getState().setInputDevice('mouse')
      markFocus(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouse)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse)
    }
  }, [])
  return null
}
