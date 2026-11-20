import { describe, expect, it } from 'vitest'
import { LEVELS } from '../config/levels'
import { SIM_STEP } from './loop'
import {
  createLevelRuntime,
  levelLength,
  placeItems,
  placeTriggers,
  stepLevel,
  validateLevel,
  type Level,
  type LevelEvent,
  type SpawnDef,
} from './level'

const B = 'BASIC'
const DEFAULT_LEVEL = LEVELS[0]

const LEVEL: Level = {
  id: 't',
  name: 'Test',
  segments: [
    {
      length: 20,
      triggers: [
        { kind: 'wave', at: 5, waves: [{ enemies: [{ type: B, from: 'placed', x: 3 }] }] },
        {
          kind: 'wave',
          at: 15,
          lock: true,
          waves: [
            { enemies: [{ type: B, from: 'right' }, { type: B, from: 'left', delay: 1 }] },
            { enemies: [{ type: B, from: 'right' }] },
          ],
        },
      ],
    },
    { length: 10, triggers: [{ kind: 'goal', at: 8 }] },
  ],
}

/** A fake world: spawned enemies stay alive until killed. */
const world = () => {
  const alive = new Set<string>()
  const spawned: { id: string; def: SpawnDef; x: number }[] = []
  let n = 0
  return {
    alive,
    spawned,
    isAlive: (id: string) => alive.has(id),
    spawn: (def: SpawnDef, x: number) => {
      const id = `e${++n}`
      alive.add(id)
      spawned.push({ id, def, x })
      return id
    },
    killAll: () => alive.clear(),
  }
}

describe('level layout', () => {
  it('measures and places triggers in absolute X', () => {
    expect(levelLength(LEVEL)).toBe(30)
    expect(placeTriggers(LEVEL).map((t) => [t.kind, t.x])).toEqual([
      ['wave', 5],
      ['wave', 15],
      ['goal', 28],
    ])
  })

  it('accepts the shipped level', () => {
    expect(validateLevel(DEFAULT_LEVEL)).toEqual([])
    expect(validateLevel(LEVEL)).toEqual([])
  })

  it('reports problems a creator can fix', () => {
    const bad: Level = {
      id: 'b',
      name: 'Bad',
      segments: [{ length: 10, triggers: [{ kind: 'wave', at: 12, waves: [{ enemies: [] }] }] }],
    }
    const errors = validateLevel(bad)
    expect(errors).toContain('Segment 1, trigger 1 is outside its segment.')
    expect(errors).toContain('Segment 1, trigger 1, wave 1 has no enemies.')
    expect(errors).toContain('Level needs exactly one goal (found 0).')
  })
})

describe('stepLevel', () => {
  it('fires a trigger when the player reaches it, once', () => {
    const rt = createLevelRuntime(LEVEL)
    const w = world()
    const input = (playerX: number) => ({ playerX, cameraX: 10, isAlive: w.isAlive, spawn: w.spawn })
    stepLevel(rt, input(4), SIM_STEP)
    expect(w.spawned).toHaveLength(0)
    stepLevel(rt, input(5), SIM_STEP)
    stepLevel(rt, input(6), SIM_STEP)
    expect(w.spawned).toHaveLength(1)
    expect(w.spawned[0].x).toBe(5)
  })

  it('locks the camera, runs waves in order with delays, and unlocks when cleared', () => {
    const rt = createLevelRuntime(LEVEL)
    const w = world()
    const events: LevelEvent[] = []
    const step = (playerX: number) =>
      events.push(...stepLevel(rt, { playerX, cameraX: 14, isAlive: w.isAlive, spawn: w.spawn }, SIM_STEP))

    step(15) // fires both the first trigger and the locked one
    expect(events).toContainEqual({ kind: 'lock', x: 14 })
    expect(rt.lockX).toBe(14)
    expect(w.spawned.filter((s) => s.x === 15)).toHaveLength(1) // the delayed one waits

    for (let i = 0; i < 60; i++) step(15)
    expect(w.spawned.filter((s) => s.x === 15)).toHaveLength(2)

    w.killAll()
    step(15)
    expect(events).toContainEqual({ kind: 'waveStart', triggerX: 15, wave: 2, of: 2 })
    expect(rt.lockX).toBe(14) // still locked during wave 2
    step(15) // wave 2 walks in
    expect(rt.lockX).toBe(14)

    w.killAll()
    step(15)
    expect(events).toContainEqual({ kind: 'unlock' })
    expect(rt.lockX).toBeNull()
  })

  it('completes at the goal and then does nothing', () => {
    const rt = createLevelRuntime(LEVEL)
    const w = world()
    const out = stepLevel(rt, { playerX: 100, cameraX: 0, isAlive: () => false, spawn: w.spawn }, SIM_STEP)
    expect(out).toContainEqual({ kind: 'complete' })
    expect(rt.complete).toBe(true)
    expect(stepLevel(rt, { playerX: 100, cameraX: 0, isAlive: () => false, spawn: w.spawn }, SIM_STEP)).toEqual([])
  })

  it.each(LEVELS.map((l) => [l.name, l] as const))(
    'plays "%s" start to finish when every enemy dies on spawn',
    (_name, level) => {
      const rt = createLevelRuntime(level)
      const w = world()
      const length = levelLength(level)
      const triggers = level.segments.flatMap((s) => s.triggers)
      let x = 0
      let locks = 0
      for (let i = 0; i < 60 * 120 && !rt.complete; i++) {
        // Walk right at 5 u/s, but not while the camera is locked.
        if (rt.lockX === null) x = Math.min(length, x + 5 * SIM_STEP)
        const ev = stepLevel(rt, { playerX: x, cameraX: x, isAlive: w.isAlive, spawn: w.spawn }, SIM_STEP)
        locks += ev.filter((e) => e.kind === 'lock').length
        w.killAll()
      }
      expect(rt.complete).toBe(true)
      expect(locks).toBe(triggers.filter((t) => t.kind === 'wave' && t.lock).length)
      expect(w.spawned).toHaveLength(
        triggers.flatMap((t) => (t.kind === 'wave' ? t.waves.flatMap((wv) => wv.enemies) : [])).length
      )
    }
  )

  it('places level items with stable ids in absolute X', () => {
    const items = placeItems(DEFAULT_LEVEL)
    expect(items[0]).toEqual({ id: 'item-1-0', pickup: 'coin', x: 45 + 5, depth: 0.3 })
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})
