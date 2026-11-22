import { describe, expect, it } from 'vitest'
import { isPlayerId, leadX, nearestPlayer, playerId, playersFocus, slotOf } from './players'

describe('player ids', () => {
  it('names players p1, p2 and tells them from enemies', () => {
    expect(playerId(1)).toBe('p1')
    expect(slotOf('p2')).toBe(2)
    expect(isPlayerId('p1')).toBe(true)
    expect(isPlayerId('p2')).toBe(true)
    expect(isPlayerId('player')).toBe(false)
    expect(isPlayerId('enemy-1')).toBe(false)
    expect(isPlayerId('pipe')).toBe(false)
  })
})

describe('nearestPlayer', () => {
  const p1 = { id: 'p1', x: 0, z: 0 }
  const p2 = { id: 'p2', x: 6, z: 0 }

  it('goes for the nearest player', () => {
    expect(nearestPlayer({ x: 4, z: 0 }, [p1, p2], null, 1)).toBe('p2')
    expect(nearestPlayer({ x: 1, z: 0 }, [p1, p2], null, 1)).toBe('p1')
  })

  it('keeps its target unless another is closer by more than the margin', () => {
    // 3.4 from p1, 2.6 from p2: within the margin, so it stays on p1.
    expect(nearestPlayer({ x: 3.4, z: 0 }, [p1, p2], 'p1', 1)).toBe('p1')
    expect(nearestPlayer({ x: 4, z: 0 }, [p1, p2], 'p1', 1)).toBe('p2')
  })

  it('drops a target that is no longer there, and has none with no players', () => {
    expect(nearestPlayer({ x: 0, z: 0 }, [p2], 'p1', 1)).toBe('p2')
    expect(nearestPlayer({ x: 0, z: 0 }, [], 'p1', 1)).toBeNull()
  })

  it('judges distance in the plane (depth counts)', () => {
    expect(nearestPlayer({ x: 3, z: 3 }, [{ id: 'p1', x: 3, z: 0 }, { id: 'p2', x: 5, z: 3 }], null, 0)).toBe('p2')
  })
})

describe('framing', () => {
  it('follows the middle of the players, and the level the one in front', () => {
    expect(playersFocus([4])).toBe(4)
    expect(playersFocus([2, 10])).toBe(6)
    expect(playersFocus([])).toBeNull()
    expect(leadX([2, 10])).toBe(10)
    expect(leadX([])).toBeNull()
  })
})
