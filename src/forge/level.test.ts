import { describe, expect, it } from 'vitest'
import { levelSchema } from '../content/schemas'
import type { Level } from '../sim/level'
import { levelLength, placeTriggers } from '../sim/level'
import {
  addObject,
  addSegment,
  blankLevel,
  getObject,
  levelFrom,
  levelObjects,
  moveObject,
  removeObject,
  removeSegment,
  resizeSegment,
  segmentAt,
  splitSegment,
} from './level'

const level = (): Level => ({
  id: 'l',
  name: 'L',
  theme: 'default',
  segments: [
    {
      length: 20,
      triggers: [{ kind: 'wave', at: 10, lock: true, waves: [{ enemies: [{ type: 'thug', from: 'placed', x: 4, depth: 0.2 }, { type: 'thug', from: 'right' }] }] }],
      items: [{ at: 5, pickup: 'food' }],
    },
    { length: 30, triggers: [{ kind: 'goal', at: 28 }], props: [{ prop: 'crate', at: 6, depth: 0.5 }] },
  ],
})

describe('forge level editing', () => {
  it('finds the segment for an absolute x', () => {
    expect(segmentAt(level(), 5)).toEqual({ seg: 0, offset: 5 })
    expect(segmentAt(level(), 20)).toEqual({ seg: 1, offset: 0 })
    expect(segmentAt(level(), 99)).toEqual({ seg: 1, offset: 30 })
    expect(segmentAt(level(), -3)).toEqual({ seg: 0, offset: 0 })
  })

  it('lists objects at absolute positions, placed enemies relative to their fight', () => {
    const objs = levelObjects(level())
    expect(objs.map((o) => [o.ref.kind, o.x, o.depth])).toEqual([
      ['trigger', 10, undefined],
      ['enemy', 14, 0.2],
      ['item', 5, 0.5],
      ['trigger', 48, undefined],
      ['prop', 26, 0.5],
    ])
  })

  it('moves an object across a segment boundary', () => {
    const r = moveObject(level(), { kind: 'item', seg: 0, index: 0 }, 23.04, 0.81)
    expect(r.ref).toEqual({ kind: 'item', seg: 1, index: 0 })
    expect(r.level.segments[0].items).toBeUndefined()
    expect(r.level.segments[1].items).toEqual([{ at: 3, pickup: 'food', depth: 0.8 }])
    expect(levelSchema.safeParse(r.level).success).toBe(true)
  })

  it('moves a fight with its placed enemies, and a placed enemy within its fight', () => {
    const moved = moveObject(level(), { kind: 'trigger', seg: 0, index: 0 }, 25)
    expect(moved.ref).toEqual({ kind: 'trigger', seg: 1, index: 1 })
    expect(levelObjects(moved.level).find((o) => o.ref.kind === 'enemy')?.x).toBe(29)
    const e = moveObject(level(), { kind: 'enemy', seg: 0, index: 0, wave: 0, enemy: 0 }, 8, 0.9)
    expect(getObject(e.level, e.ref)).toEqual({ type: 'thug', from: 'placed', x: -2, depth: 0.9 })
  })

  it('adds and removes objects', () => {
    let r = addObject(level(), 30, { kind: 'wave', enemyType: 'rusher' })
    expect(getObject(r.level, r.ref)).toMatchObject({ kind: 'wave', at: 10, lock: true })
    r = addObject(r.level, 2, { kind: 'prop', prop: 'barrel', depth: 0.33 })
    expect(getObject(r.level, r.ref)).toEqual({ at: 2, prop: 'barrel', depth: 0.35 })
    r = addObject(r.level, 40, { kind: 'boss', enemy: 'HARV' })
    expect(getObject(r.level, r.ref)).toEqual({ kind: 'boss', at: 20, enemy: 'HARV', from: 'right', intro: true })
    // The last enemy of a fight takes the fight with it.
    let l = removeObject(level(), { kind: 'enemy', seg: 0, index: 0, wave: 0, enemy: 0 })
    expect(l.segments[0].triggers).toHaveLength(1)
    l = removeObject(l, { kind: 'enemy', seg: 0, index: 0, wave: 0, enemy: 0 })
    expect(l.segments[0].triggers).toHaveLength(0)
  })

  it('resizes, splits, adds and removes segments', () => {
    expect(resizeSegment(level(), 0, 4).segments[0].length).toBe(10) // can't cut off the fight at 10
    expect(resizeSegment(level(), 0, 33.33).segments[0].length).toBe(33.3)
    const split = splitSegment(level(), 8)
    expect(split.segments.map((s) => s.length)).toEqual([8, 12, 30])
    expect(split.segments[0].items).toHaveLength(1)
    expect(split.segments[1].triggers[0].at).toBe(2)
    expect(levelLength(split)).toBe(50)
    expect(placeTriggers(split).map((t) => t.x)).toEqual(placeTriggers(level()).map((t) => t.x))
    expect(addSegment(level()).segments).toHaveLength(3)
    expect(removeSegment(level(), 0).segments).toHaveLength(1)
    expect(removeSegment(removeSegment(level(), 0), 0).segments).toHaveLength(1)
  })

  it('makes a valid blank level', () => {
    expect(levelSchema.safeParse({ id: 'x', name: 'X', ...blankLevel() }).success).toBe(true)
  })

  it('plays from a point: cuts what is behind and drops fights already passed', () => {
    const l = levelFrom(level(), 15, 3)
    // The cut is at 12: the fight at 10 and the item at 5 are gone; the player starts at 3 (= old 15).
    expect(l.segments.map((s) => s.length)).toEqual([8, 30])
    expect(l.segments[0].triggers).toEqual([])
    expect(l.segments[0].items).toBeUndefined()
    expect(placeTriggers(l).map((t) => t.x)).toEqual([36])
    expect(levelSchema.safeParse(l).success).toBe(true)
    // A fight just ahead of the player stays.
    expect(placeTriggers(levelFrom(level(), 9, 3)).map((t) => t.x)).toEqual([4, 42])
    // Near the start nothing is cut.
    expect(levelFrom(level(), 2, 3)).toEqual(level())
  })
})
