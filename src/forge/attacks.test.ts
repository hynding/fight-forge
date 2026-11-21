import { describe, expect, it } from 'vitest'
import { attackRows, attackWarnings, withAttacks } from './attacks'

describe('Forge attack rows', () => {
  it('shows a lone attack move as one row, and the first edit makes it a list', () => {
    const enemy = { maxHealth: 10, attackMove: 'rushPunch' }
    const rows = attackRows(enemy, 'punch')
    expect(rows).toEqual([{ move: 'rushPunch', range: 'any' }])
    expect(withAttacks(enemy, [...rows, { move: 'hook', range: 'near', weight: 2, cooldown: undefined }])).toEqual({
      maxHealth: 10,
      attacks: [{ move: 'rushPunch', range: 'any' }, { move: 'hook', range: 'near', weight: 2 }],
    })
    expect(attackRows({}, 'punch')).toEqual([{ move: 'punch', range: 'any' }])
  })

  it('warns about far attacks without far reach and about no near attack', () => {
    expect(attackWarnings([{ move: 'a', range: 'near' }, { move: 'b', range: 'far' }], 5)).toEqual([])
    expect(attackWarnings([{ move: 'a', range: 'near' }, { move: 'b', range: 'far' }], undefined)).toHaveLength(1)
    expect(attackWarnings([{ move: 'b', range: 'far' }], 5)).toEqual(['No near attack: it walks up to you and never hits.'])
  })
})
