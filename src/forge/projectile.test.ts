import { describe, expect, it } from 'vitest'
import { DEFAULT_FROM, firingMoves } from './projectile'

describe('firingMoves', () => {
  it('finds the moves that fire a projectile, the pack\'s over the default\'s', () => {
    expect(firingMoves({}, 'knife')).toEqual([{ move: 'knifeThrow', from: [0.6, 0.3] }])
    const json = {
      moves: {
        knifeThrow: { projectile: { id: 'knife', from: [1, 0.5] } },
        toss: { projectile: { id: 'knife', from: DEFAULT_FROM } },
        jab: { startup: 0 },
      },
    }
    expect(firingMoves(json, 'knife')).toEqual([
      { move: 'knifeThrow', from: [1, 0.5] },
      { move: 'toss', from: DEFAULT_FROM },
    ])
    expect(firingMoves(json, 'nothing')).toEqual([])
  })
})
