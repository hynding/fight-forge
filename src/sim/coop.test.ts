import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { inputMap } from './actions'
import { coopHealthScale, dropInX, joinOutcome, keyboard2Map, padSeat, routeKey, withoutInputs } from './coop'

const p1Full = inputMap(DEFAULT_CONFIG.input.bindings)
const p2 = keyboard2Map(DEFAULT_CONFIG.input.keyboard2)
const p1Split = withoutInputs(p1Full, p2)

describe('keyboard routing', () => {
  it('gives player 1 the arrows until player 2 plays on the keyboard', () => {
    expect(routeKey('key:arrowleft', p1Full, p2, false)).toBe(1)
    expect(routeKey('key:arrowleft', p1Split, p2, true)).toBe(2)
    // WASD stays player 1's.
    expect(routeKey('key:a', p1Split, p2, true)).toBe(1)
  })

  it("joins on player 2's attack or pause key", () => {
    expect(routeKey('key:1', p1Full, p2, false)).toBe('join')
    expect(routeKey('key:enter', p1Full, p2, false)).toBe('join')
    expect(routeKey('key:0', p1Full, p2, false)).toBeNull()
    expect(routeKey('key:1', p1Split, p2, true)).toBe(2)
  })

  it('keeps the second map off every key player 1 still needs', () => {
    for (const action of ['left', 'right', 'attack', 'pause'] as const)
      expect([...p1Split.values()]).toContain(action)
  })
})

describe('pads', () => {
  const seats = { p1: null, p2: null, p2Free: true, expected: 1 }

  it("makes the first pad player 1's in a one-player game", () => {
    expect(padSeat(0, ['jump'], seats)).toBe(1)
    expect(padSeat(0, ['attack'], seats)).toBe(1)
  })

  it('joins a second pad with attack or start', () => {
    const s = { ...seats, p1: 0 }
    expect(padSeat(0, ['attack'], s)).toBe(1)
    expect(padSeat(1, ['jump'], s)).toBeNull()
    expect(padSeat(1, ['attack'], s)).toBe('join')
    expect(padSeat(1, ['pause'], s)).toBe('join')
    expect(padSeat(1, ['attack'], { ...s, p2: 1, p2Free: false })).toBe(2)
    expect(padSeat(2, ['attack'], { ...s, p2: 1, p2Free: false })).toBeNull()
  })

  it('in a two-player game, lets the first pad join while player 1 is on the keyboard', () => {
    const s = { ...seats, expected: 2 }
    expect(padSeat(0, ['jump'], s)).toBeNull()
    expect(padSeat(0, ['attack'], s)).toBe('join')
    // Once player 2 is in, the next pad is player 1's.
    expect(padSeat(1, ['jump'], { ...s, p2: 0, p2Free: false })).toBe(1)
  })
})

describe('joining', () => {
  it('adds a new player, brings one back on a continue, or refuses', () => {
    expect(joinOutcome(undefined, 0)).toBe('new')
    expect(joinOutcome({ lives: 2 }, 3)).toBeNull()
    expect(joinOutcome({ lives: 0 }, 1)).toBe('continue')
    expect(joinOutcome({ lives: 0 }, 0)).toBeNull()
  })

  it('drops in beside the partner, on the side with room', () => {
    expect(dropInX(null, 20, 1.5)).toBe(20)
    expect(dropInX(24, 20, 1.5)).toBe(22.5)
    expect(dropInX(16, 20, 1.5)).toBe(17.5)
  })

  it('scales enemy health only with two players in', () => {
    expect(coopHealthScale(1, 1.5)).toBe(1)
    expect(coopHealthScale(2, 1.5)).toBe(1.5)
  })
})
