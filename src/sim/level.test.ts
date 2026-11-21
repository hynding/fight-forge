import { describe, expect, it } from 'vitest'
import { LEVELS } from '../config/levels'
import { SIM_STEP } from './loop'
import {
  createLevelRuntime,
  levelLength,
  placeItems,
  placeProps,
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
  theme: 'default',
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
      theme: 'default',
      segments: [{ length: 10, triggers: [{ kind: 'wave', at: 12, waves: [{ enemies: [] }] }] }],
    }
    const errors = validateLevel(bad)
    expect(errors).toContain('Segment 1, trigger 1 is outside its segment.')
    expect(errors).toContain('Segment 1, trigger 1, wave 1 has no enemies.')
    expect(errors).toContain('Level needs exactly one goal, or a boss that ends it (found 0 goals).')
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

  it('keeps a lock when the whole wave spawns on the step it starts', () => {
    const level: Level = {
      id: 'n',
      name: 'Now',
      theme: 'default',
      segments: [{ length: 30, triggers: [{ kind: 'wave', at: 3, lock: true, waves: [{ enemies: [{ type: B, from: 'placed', x: 2 }] }] }, { kind: 'goal', at: 28 }] }],
    }
    const rt = createLevelRuntime(level)
    const w = world()
    // Like the game: who is alive is read before the step's spawns.
    const step = () => {
      const snapshot = new Set(w.alive)
      return stepLevel(rt, { playerX: 3, cameraX: 9, isAlive: (id) => snapshot.has(id), spawn: w.spawn }, SIM_STEP)
    }
    expect(step()).not.toContainEqual({ kind: 'unlock' })
    expect(step()).toEqual([])
    expect(rt.lockX).toBe(9)
    w.killAll()
    expect(step()).toContainEqual({ kind: 'unlock' })
  })

  it("doesn't count a goal inside a locked screen until the fight is won", () => {
    const level: Level = {
      id: 'g',
      name: 'Goal on screen',
      theme: 'default',
      segments: [{ length: 30, triggers: [{ kind: 'wave', at: 10, lock: true, waves: [{ enemies: [{ type: B, from: 'right' }] }] }, { kind: 'goal', at: 20 }] }],
    }
    const rt = createLevelRuntime(level)
    const w = world()
    const step = (playerX: number) => stepLevel(rt, { playerX, cameraX: 10, isAlive: (id) => w.alive.has(id), spawn: w.spawn }, SIM_STEP)
    expect(step(10)).toContainEqual({ kind: 'lock', x: 10 })
    expect(step(21)).not.toContainEqual({ kind: 'complete' })
    expect(rt.complete).toBe(false)
    w.killAll()
    expect(step(21)).toContainEqual({ kind: 'unlock' })
    expect(step(21)).toContainEqual({ kind: 'complete' })
  })

  it('completes at the goal and then does nothing', () => {
    const rt = createLevelRuntime(LEVEL)
    const w = world()
    // Locked fights on the way are won (nobody stays alive) before the goal counts.
    const out: LevelEvent[] = []
    for (let i = 0; i < 600 && !rt.complete; i++) out.push(...stepLevel(rt, { playerX: 100, cameraX: 0, isAlive: () => false, spawn: w.spawn }, SIM_STEP))
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
      // Locking waves and boss fights each lock once; every enemy and boss spawns.
      expect(locks).toBe(triggers.filter((t) => (t.kind === 'wave' && t.lock) || t.kind === 'boss').length)
      expect(w.spawned).toHaveLength(
        triggers.flatMap((t): unknown[] => (t.kind === 'wave' ? t.waves.flatMap((wv) => wv.enemies) : t.kind === 'boss' ? [t.enemy] : [])).length
      )
    }
  )

  it('places level items with stable ids in absolute X', () => {
    const items = placeItems(DEFAULT_LEVEL)
    expect(items[0]).toEqual({ id: 'item-0-0', pickup: 'pipe', x: 20, depth: 0.5 })
    expect(items[1]).toEqual({ id: 'item-1-0', pickup: 'coin', x: 45 + 5, depth: 0.3 })
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

describe('placeProps', () => {
  it('gives props absolute X, defaults and stable ids', () => {
    const level: Level = {
      id: 'p',
      name: 'Props',
      theme: 'default',
      segments: [
        { length: 10, triggers: [], props: [{ prop: 'crate', at: 3 }] },
        { length: 10, triggers: [{ kind: 'goal', at: 9 }], props: [{ prop: 'barrel', at: 2, depth: 0.1, y: 1 }] },
      ],
    }
    expect(placeProps(level)).toEqual([
      { id: 'prop-0-0', prop: 'crate', x: 3, y: 0, depth: 0.5 },
      { id: 'prop-1-0', prop: 'barrel', x: 12, y: 1, depth: 0.1 },
    ])
  })
})

describe('boss trigger', () => {
  const bossLevel = (extra: Partial<Extract<Level['segments'][0]['triggers'][0], { kind: 'boss' }>> = {}): Level => ({
    id: 'boss',
    name: 'Boss',
    theme: 'default',
    segments: [
      {
        length: 30,
        triggers: [
          { kind: 'boss', at: 10, enemy: 'BIG', from: 'placed', offset: 4, music: 'boss', ...extra },
          { kind: 'wave', at: 12, waves: [{ enemies: [{ type: B, from: 'right' }] }] },
        ],
      },
      { length: 10, triggers: extra.endsLevel === false ? [{ kind: 'goal', at: 8 }] : [] },
    ],
  })

  it('counts as the goal when it ends the level', () => {
    expect(validateLevel(bossLevel())).toEqual([])
    expect(validateLevel(bossLevel({ endsLevel: false }))).toEqual([])
  })

  it('locks, brings in the boss, and completes the level when it is beaten', () => {
    const rt = createLevelRuntime(bossLevel())
    const w = world()
    // Like the game, who is alive is read before the step spawns anyone.
    const step = (playerX: number) => {
      const alive = new Set(w.alive)
      return stepLevel(rt, { playerX, cameraX: 9, isAlive: (id) => alive.has(id), spawn: w.spawn }, SIM_STEP)
    }
    expect(step(5)).toEqual([])
    const start = step(10)
    expect(start.map((e) => e.kind)).toEqual(['bossStart', 'lock'])
    expect(w.spawned[0]).toMatchObject({ def: { type: 'BIG', from: 'placed', x: 4 }, x: 10 })
    // Walking on while it's alive starts the next fight, but the level waits.
    expect(step(12).map((e) => e.kind)).toEqual(['waveStart'])
    for (let i = 0; i < 30; i++) expect(step(14)).toEqual([])
    w.alive.delete(w.spawned[0].id)
    expect(step(14)).toEqual([
      { kind: 'bossDefeated', id: w.spawned[0].id, endsLevel: true },
      { kind: 'complete' },
    ])
    expect(step(40)).toEqual([])
  })

  it('unlocks instead when the boss doesn\'t end the level', () => {
    const rt = createLevelRuntime(bossLevel({ endsLevel: false }))
    const w = world()
    const step = (playerX: number) => stepLevel(rt, { playerX, cameraX: 9, isAlive: w.isAlive, spawn: w.spawn }, SIM_STEP)
    step(10)
    // The goal waits while the boss is alive.
    expect(step(38).map((e) => e.kind)).toEqual(['waveStart'])
    w.alive.delete(w.spawned[0].id)
    expect(step(38).map((e) => e.kind)).toEqual(['bossDefeated', 'unlock'])
    expect(step(38).map((e) => e.kind)).toEqual(['complete'])
  })
})

describe('the shipped levels', () => {
  it('end level 2 with a boss fight', () => {
    const boss = LEVELS[1].segments.flatMap((s) => s.triggers).find((t) => t.kind === 'boss')
    expect(boss).toMatchObject({ kind: 'boss', enemy: 'HARV', music: 'boss' })
  })
})
