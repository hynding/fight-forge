// Menu navigation with a controller: move focus between the buttons on
// screen by direction, like a TV remote. Pure geometry on rectangles.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type NavDir = 'up' | 'down' | 'left' | 'right'

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

/**
 * The best next item from `current` in direction `dir`: among items whose
 * centre lies that way, the nearest, weighting sideways drift twice as much
 * as distance along the direction. Returns `current` when nothing lies that way.
 */
export const nextFocus = (rects: readonly Rect[], current: number, dir: NavDir): number => {
  const from = center(rects[current])
  let best = current
  let bestScore = Infinity
  rects.forEach((r, i) => {
    if (i === current) return
    const c = center(r)
    const dx = c.x - from.x
    const dy = c.y - from.y
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 1) return
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** The item nearest a point (the screen's centre, for the first press). */
export const nearestTo = (rects: readonly Rect[], x: number, y: number): number => {
  let best = -1
  let bestD = Infinity
  rects.forEach((r, i) => {
    const c = center(r)
    const d = Math.hypot(c.x - x, c.y - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Which menu direction a set of pad inputs points (d-pad or left stick). */
export const padDirection = (inputs: ReadonlySet<string>): NavDir | null => {
  for (const dir of ['up', 'down', 'left', 'right'] as const) if (inputs.has(dir) || inputs.has(`ls-${dir}`)) return dir
  return null
}

/** Auto-repeat for a held direction: first after `delay`, then every `rate` seconds. */
export interface Repeat {
  dir: NavDir | null
  next: number
}

export const MENU_REPEAT = { delay: 0.4, rate: 0.15 }

/** Steps the repeat with the direction held now at time `t`; returns a direction to move, or null. */
export const stepRepeat = (r: Repeat, dir: NavDir | null, t: number): NavDir | null => {
  if (dir !== r.dir) {
    r.dir = dir
    r.next = t + MENU_REPEAT.delay
    return dir
  }
  if (dir && t >= r.next) {
    r.next = t + MENU_REPEAT.rate
    return dir
  }
  return null
}
