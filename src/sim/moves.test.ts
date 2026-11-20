import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  createMoveRunner,
  interruptMove,
  isMoveActive,
  movePhase,
  moveDuration,
  stepMoveRunner,
  validateMoves,
  type MoveDef,
  type MoveSet,
} from './moves'

const base = (over: Partial<MoveDef> = {}): MoveDef => ({
  startup: 0.1,
  active: 0.05,
  recovery: 0.15,
  damage: 5,
  hitbox: { forward: 1, up: 0, halfX: 0.5, halfY: 0.5, halfZ: 0.5 },
  reaction: { hitstun: 0.3, knockback: { x: 1, y: 0 } },
  ...over,
})

const MOVES: MoveSet = {
  a: base({ next: 'b' }),
  b: base({ next: 'c', cancelFrom: 0.2 }),
  c: base({ recovery: 0.3 }),
}

const steps = (seconds: number) => Math.round(seconds / SIM_STEP)

/** Steps the runner `n` times with the button in state `held`; returns the events. */
const run = (r: ReturnType<typeof createMoveRunner>, n: number, held = false) => {
  const events: (string | null)[] = []
  for (let i = 0; i < n; i++) events.push(stepMoveRunner(r, held, SIM_STEP, MOVES, 'a'))
  return events
}

describe('movePhase', () => {
  it('walks startup, active, recovery, then ends, on whole steps', () => {
    const m = MOVES.a
    expect(movePhase(m, 0)).toBe('startup')
    expect(movePhase(m, steps(0.1) * SIM_STEP)).toBe('active')
    expect(movePhase(m, steps(0.15) * SIM_STEP)).toBe('recovery')
    expect(movePhase(m, steps(moveDuration(m)) * SIM_STEP)).toBeNull()
  })
})

describe('stepMoveRunner', () => {
  it('starts the first move on a press, not while held', () => {
    const r = createMoveRunner()
    expect(run(r, 1, true)).toEqual(['started'])
    expect(r.move).toBe('a')
    expect(r.instance).toBe(1)
    // Holding through the whole move doesn't start another.
    const events = run(r, steps(moveDuration(MOVES.a)) + 5, true)
    expect(events.filter((e) => e === 'started')).toHaveLength(0)
    expect(r.move).toBeNull()
  })

  it('is active for exactly the active frames', () => {
    const r = createMoveRunner()
    let active = 0
    stepMoveRunner(r, true, SIM_STEP, MOVES, 'a')
    for (let i = 0; i < 60; i++) {
      if (isMoveActive(r, MOVES)) active++
      stepMoveRunner(r, false, SIM_STEP, MOVES, 'a')
    }
    expect(active).toBe(steps(MOVES.a.active))
  })

  it('ends after startup + active + recovery without a press', () => {
    const r = createMoveRunner()
    run(r, 1, true)
    const events = run(r, steps(moveDuration(MOVES.a)))
    expect(events[events.length - 1]).toBe('ended')
    expect(events.slice(0, -1).every((e) => e === null)).toBe(true)
  })

  it('buffers a press during startup and chains at the cancel window', () => {
    const r = createMoveRunner()
    run(r, 1, true)
    run(r, 1, false)
    run(r, 1, true) // pressed early, during startup
    expect(r.move).toBe('a')
    expect(r.buffered).toBe(true)
    // Cancel window defaults to the end of the active phase.
    let n = 3
    while (r.move === 'a') {
      stepMoveRunner(r, false, SIM_STEP, MOVES, 'a')
      n++
    }
    expect(r.move).toBe('b')
    expect(n - 1).toBe(steps(0.15))
    expect(r.instance).toBe(2)
  })

  it('chains a full combo with one press per move', () => {
    const r = createMoveRunner()
    const seen: string[] = []
    let held = false
    for (let i = 0; i < 200; i++) {
      held = !held // press every other step
      if (stepMoveRunner(r, held, SIM_STEP, MOVES, 'a') === 'started') seen.push(r.move!)
    }
    // The combo ends at "c" (no next), then the chain restarts from "a".
    expect(seen.slice(0, 4)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('drops the chain if the press comes after the move ends', () => {
    const r = createMoveRunner()
    run(r, 1, true)
    run(r, steps(moveDuration(MOVES.a)) + 2)
    run(r, 1, true)
    expect(r.move).toBe('a')
  })

  it('stops when interrupted', () => {
    const r = createMoveRunner()
    run(r, 1, true)
    interruptMove(r)
    expect(r.move).toBeNull()
    expect(isMoveActive(r, MOVES)).toBe(false)
  })
})

describe('validateMoves', () => {
  it('accepts a good set and flags unknown references', () => {
    expect(validateMoves(MOVES, ['a'])).toEqual([])
    expect(validateMoves(MOVES, ['zzz'])).toHaveLength(1)
    expect(validateMoves({ x: base({ next: 'nope' }) }, [])).toHaveLength(1)
    expect(validateMoves({ x: base({ cancelFrom: 5 }) }, [])).toHaveLength(1)
  })
})
