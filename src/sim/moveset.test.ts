import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import {
  createChordBuffer,
  matchTrigger,
  pressKey,
  relativeDirection,
  shadowedTriggers,
  stepChords,
  type MovesetAction,
  type Moveset,
  type TriggerContext,
} from './moveset'
import { createMoveRunner, stepMoves, type MoveSet } from './moves'
import { SIM_STEP } from './loop'

const ctx = (over: Partial<TriggerContext> = {}): TriggerContext => ({
  air: false,
  running: false,
  blocking: false,
  direction: null,
  canPay: () => true,
  ...over,
})

const DEFAULT = DEFAULT_CONFIG.player.moveset

describe('the default moveset', () => {
  it('picks the air, running and light attacks as before', () => {
    const move = (c: TriggerContext) => DEFAULT[matchTrigger(DEFAULT, 'attack', c)]?.move
    expect(move(ctx({ air: true }))).toBe('jumpKick')
    expect(move(ctx({ running: true }))).toBe('dashPunch')
    expect(move(ctx())).toBe('jab')
    expect(move(ctx({ direction: 'away' }))).toBe('jab')
  })
  it('does not attack while blocking', () => {
    expect(matchTrigger(DEFAULT, 'attack', ctx({ blocking: true }))).toBe(-1)
  })
})

describe('matchTrigger', () => {
  const set: Moveset = [
    { action: 'attack', direction: 'away', move: 'backElbow' },
    { action: ['attack', 'jump'], move: 'spinKick', cost: { health: 8 } },
    { action: 'attack', when: 'blocking', move: 'guardPush' },
    { action: 'attack', move: 'jab' },
  ]
  it('matches direction, chord, situation and cost', () => {
    expect(set[matchTrigger(set, 'attack', ctx({ direction: 'away' }))].move).toBe('backElbow')
    expect(set[matchTrigger(set, 'attack', ctx({ direction: 'toward' }))].move).toBe('jab')
    expect(set[matchTrigger(set, 'attack+jump', ctx())].move).toBe('spinKick')
    expect(matchTrigger(set, 'attack+jump', ctx({ canPay: (t) => !t.cost }))).toBe(-1)
    expect(set[matchTrigger(set, 'attack', ctx({ blocking: true }))].move).toBe('guardPush')
    expect(matchTrigger(set, 'dodge', ctx())).toBe(-1)
  })
  it('names chords the same whatever order they are written in', () => {
    expect(pressKey(['jump', 'attack'])).toBe('attack+jump')
  })
})

describe('relativeDirection', () => {
  it('reads the held direction against the facing', () => {
    expect(relativeDirection({ x: 1, z: 0 }, 1)).toBe('toward')
    expect(relativeDirection({ x: 1, z: 0 }, -1)).toBe('away')
    expect(relativeDirection({ x: 0.2, z: -1 }, 1)).toBe('up')
    expect(relativeDirection({ x: 0, z: 1 }, 1)).toBe('down')
    expect(relativeDirection({ x: 0.1, z: 0 }, 1)).toBeNull()
  })
})

describe('shadowedTriggers', () => {
  it('flags rows an earlier row always beats', () => {
    expect(shadowedTriggers(DEFAULT)).toEqual([])
    const set: Moveset = [
      { action: 'attack', move: 'jab' },
      { action: 'attack', when: 'running', move: 'dashPunch' }, // ground covers running
      { action: 'attack', direction: 'away', move: 'backElbow' }, // jab takes any direction
      { action: 'attack', when: 'air', move: 'jumpKick' },
    ]
    expect(shadowedTriggers(set)).toEqual([1, 2])
    // A cost can fail, so the row after it still matters.
    expect(shadowedTriggers([{ action: 'attack', move: 'a', cost: { cooldown: 1 } }, { action: 'attack', move: 'b' }])).toEqual([])
  })
})

describe('stepChords', () => {
  const set: Moveset = [
    { action: ['attack', 'jump'], move: 'spinKick' },
    { action: 'attack', move: 'jab' },
  ]
  const W = 0.06
  const run = (steps: { pressed?: MovesetAction[]; held?: MovesetAction[] }[]) => {
    const b = createChordBuffer()
    return steps.map((s, i) => stepChords(b, new Set(s.pressed), new Set(s.held ?? s.pressed), i * SIM_STEP, W, set))
  }

  it('presses the chord when both actions arrive within the window, hiding them meanwhile', () => {
    const r = run([{ pressed: ['attack'] }, { held: ['attack'] }, { pressed: ['jump'], held: ['attack', 'jump'] }, { held: ['attack', 'jump'] }])
    expect(r.map((s) => s.presses)).toEqual([[], [], ['attack+jump'], []])
    expect([...r[0].hidden]).toEqual(['attack'])
    // Used by the chord: still hidden while held, so the fighter doesn't also jump.
    expect([...r[3].hidden].sort()).toEqual(['attack', 'jump'])
  })

  it('presses a lone action late, once the window passes', () => {
    const r = run([{ pressed: ['attack'], held: [] }, {}, {}, {}, {}])
    expect(r.map((s) => s.presses)).toEqual([[], [], [], [], ['attack']])
    expect([...r[4].tapped]).toEqual(['attack'])
  })

  it('lets actions in no chord through at once', () => {
    const r = run([{ pressed: ['dodge'] }])
    expect(r[0].presses).toEqual(['dodge'])
    expect(r[0].hidden.size).toBe(0)
  })
})

describe('branches', () => {
  const moves: MoveSet = {
    jab: { startup: 0, active: 2 * SIM_STEP, recovery: 4 * SIM_STEP, damage: 1, hitbox: { forward: 1, up: 0, halfX: 1, halfY: 1, halfZ: 1 }, reaction: { hitstun: 0, knockback: { x: 0, y: 0 } }, next: 'jab2', branches: { 'attack+jump': 'launcher' } },
    jab2: { startup: 0, active: SIM_STEP, recovery: SIM_STEP, damage: 1, hitbox: { forward: 1, up: 0, halfX: 1, halfY: 1, halfZ: 1 }, reaction: { hitstun: 0, knockback: { x: 0, y: 0 } } },
    launcher: { startup: 0, active: SIM_STEP, recovery: SIM_STEP, damage: 1, hitbox: { forward: 1, up: 0, halfX: 1, halfY: 1, halfZ: 1 }, reaction: { hitstun: 0, knockback: { x: 0, y: 0 } } },
  }
  it('chains next on the same press and branches on another', () => {
    const r = createMoveRunner()
    expect(stepMoves(r, 'attack', SIM_STEP, moves, 'jab')).toBe('started')
    stepMoves(r, 'attack+jump', SIM_STEP, moves, null)
    stepMoves(r, null, SIM_STEP, moves, null)
    expect(r.move).toBe('launcher')
    const s = createMoveRunner()
    stepMoves(s, 'attack', SIM_STEP, moves, 'jab')
    stepMoves(s, 'attack', SIM_STEP, moves, null)
    stepMoves(s, null, SIM_STEP, moves, null)
    expect(s.move).toBe('jab2')
  })
  it('ignores a press with no next or branch', () => {
    const r = createMoveRunner()
    stepMoves(r, 'attack', SIM_STEP, moves, 'jab')
    stepMoves(r, 'dodge', SIM_STEP, moves, null)
    expect(r.buffered).toBe(false)
  })
})
