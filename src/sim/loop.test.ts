import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_FRAME, SIM_STEP, SimLoop, SYSTEM_ORDER } from './loop'
import { MAX_FRAME_STEP } from '../utils/gameTime'
import { createPlayerAttackState, stepPlayerAttack } from './timers'
import { isInAttackCone } from './combat'

describe('SimLoop', () => {
  it('runs one step per 1/60s frame', () => {
    const loop = new SimLoop()
    let steps = 0
    loop.add('count', 0, () => steps++)
    for (let i = 0; i < 60; i++) loop.advance(1 / 60)
    expect(steps).toBe(60)
    expect(loop.time).toBeCloseTo(1)
  })

  it('always hands systems the fixed step', () => {
    const loop = new SimLoop()
    const dts = new Set<number>()
    loop.add('dt', 0, (dt) => dts.add(dt))
    for (const d of [0.007, 0.033, 0.016, 0.05, 0.001]) loop.advance(d)
    expect([...dts]).toEqual([SIM_STEP])
  })

  it('accumulates partial frames (144 Hz) without losing time', () => {
    const loop = new SimLoop()
    let steps = 0
    loop.add('count', 0, () => steps++)
    for (let i = 0; i < 144; i++) loop.advance(1 / 144)
    expect(steps).toBeGreaterThanOrEqual(59)
    expect(steps).toBeLessThanOrEqual(60)
  })

  it('runs several steps for a slow frame, capped by the gameStep clamp', () => {
    const loop = new SimLoop()
    expect(loop.advance(1 / 20)).toBe(3)
    // A hidden tab returning with a 30s delta is clamped.
    expect(loop.advance(30)).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME)
    expect(MAX_STEPS_PER_FRAME).toBe(Math.round(MAX_FRAME_STEP / SIM_STEP))
  })

  it('ignores NaN and negative deltas', () => {
    const loop = new SimLoop()
    expect(loop.advance(NaN)).toBe(0)
    expect(loop.advance(-1)).toBe(0)
  })

  it('runs systems by order, then by registration', () => {
    const loop = new SimLoop()
    const ran: string[] = []
    loop.add('c', 300, () => ran.push('c'))
    loop.add('a', 100, () => ran.push('a'))
    loop.add('b1', 200, () => ran.push('b1'))
    loop.add('b2', 200, () => ran.push('b2'))
    loop.advance(SIM_STEP)
    expect(ran).toEqual(['a', 'b1', 'b2', 'c'])
    expect(loop.order).toEqual(['a', 'b1', 'b2', 'c'])
  })

  it('removes a system with the returned function', () => {
    const loop = new SimLoop()
    let n = 0
    const remove = loop.add('x', 0, () => n++)
    loop.advance(SIM_STEP)
    remove()
    loop.advance(SIM_STEP)
    expect(n).toBe(1)
  })

  it('applies adds and removes made during a step on the next step', () => {
    const loop = new SimLoop()
    const ran: string[] = []
    let removeB: () => void = () => {}
    loop.add('a', 0, () => {
      ran.push('a')
      removeB()
      loop.add('late', 0, () => ran.push('late'))
    })
    removeB = loop.add('b', 1, () => ran.push('b'))
    loop.advance(SIM_STEP)
    expect(ran).toEqual(['a', 'b'])
  })
})

describe('system order', () => {
  it('lists player attack before combat before spawning', () => {
    expect(SYSTEM_ORDER.playerAttack).toBeLessThan(SYSTEM_ORDER.combat)
    expect(SYSTEM_ORDER.enemyAttackSlot).toBeLessThan(SYSTEM_ORDER.combat)
    expect(SYSTEM_ORDER.combat).toBeLessThan(SYSTEM_ORDER.spawner)
  })

  it('lets combat see a swing on the step it starts', () => {
    const loop = new SimLoop()
    const attack = createPlayerAttackState()
    const player = { x: 0, y: 0, z: 0 }
    const facing = { x: 0, y: 0, z: -1 }
    const enemy = { x: 0, y: 0, z: -1 }
    const hitsOnStep: number[] = []
    let wantsAttack = false

    // Registered in the "wrong" order on purpose: SYSTEM_ORDER decides.
    loop.add('combat', SYSTEM_ORDER.combat, () => {
      if (attack.active && isInAttackCone(player, facing, enemy, { range: 3, cone: 0.5 })) {
        hitsOnStep.push(loop.tick)
      }
    })
    loop.add('playerAttack', SYSTEM_ORDER.playerAttack, (dt) => {
      stepPlayerAttack(attack, wantsAttack, dt, { duration: 0.2, cooldown: 0.5 })
    })

    loop.advance(SIM_STEP)
    wantsAttack = true
    loop.advance(SIM_STEP)
    expect(hitsOnStep[0]).toBe(1)
  })
})
