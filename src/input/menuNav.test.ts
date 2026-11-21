import { describe, expect, it } from 'vitest'
import { nearestTo, nextFocus, padDirection, stepRepeat, MENU_REPEAT, type Rect } from './menuNav'

const box = (x: number, y: number): Rect => ({ x, y, width: 100, height: 40 })
// A column of three, with a fourth to the right of the middle one.
const rects = [box(0, 0), box(0, 100), box(0, 200), box(300, 110)]

describe('nextFocus', () => {
  it('moves along a column', () => {
    expect(nextFocus(rects, 0, 'down')).toBe(1)
    expect(nextFocus(rects, 1, 'down')).toBe(2)
    expect(nextFocus(rects, 1, 'up')).toBe(0)
  })
  it('moves sideways to the nearest item that way', () => {
    expect(nextFocus(rects, 1, 'right')).toBe(3)
    expect(nextFocus(rects, 3, 'left')).toBe(1)
  })
  it('stays put when nothing lies that way', () => {
    expect(nextFocus(rects, 0, 'up')).toBe(0)
    expect(nextFocus(rects, 3, 'right')).toBe(3)
  })
})

describe('menu helpers', () => {
  it('starts at the item nearest the centre', () => {
    expect(nearestTo(rects, 340, 120)).toBe(3)
    expect(nearestTo([], 0, 0)).toBe(-1)
  })
  it('reads the d-pad or the left stick', () => {
    expect(padDirection(new Set(['a']))).toBeNull()
    expect(padDirection(new Set(['down']))).toBe('down')
    expect(padDirection(new Set(['ls-left']))).toBe('left')
  })
  it('repeats a held direction after a delay', () => {
    const r = { dir: null, next: 0 }
    expect(stepRepeat(r, 'down', 0)).toBe('down')
    expect(stepRepeat(r, 'down', MENU_REPEAT.delay / 2)).toBeNull()
    expect(stepRepeat(r, 'down', MENU_REPEAT.delay)).toBe('down')
    expect(stepRepeat(r, 'down', MENU_REPEAT.delay + MENU_REPEAT.rate / 2)).toBeNull()
    expect(stepRepeat(r, null, 1)).toBeNull()
    expect(stepRepeat(r, 'up', 1.1)).toBe('up')
  })
})
