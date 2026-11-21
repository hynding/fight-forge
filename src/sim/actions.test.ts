import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { mergeBindings } from './input'
import {
  createActionSampler,
  dropEdges,
  frameControls,
  inputDown,
  inputMap,
  inputUp,
  keyInput,
  releaseAll,
  sampleActions,
} from './actions'
import { createMoveRunner, stepMoveRunner } from './moves'
import { SIM_STEP } from './loop'

const map = inputMap(DEFAULT_CONFIG.input.bindings)
const down = (s: ReturnType<typeof createActionSampler>, key: string) => inputDown(s, keyInput(key), 'keyboard')
const up = (s: ReturnType<typeof createActionSampler>, key: string) => inputUp(s, keyInput(key))

describe('inputMap', () => {
  it.each([
    ['w', 'forward'],
    ['W', 'forward'], // Shift held / Caps Lock
    ['s', 'backward'],
    ['a', 'left'],
    ['ArrowLeft', 'left'],
    ['d', 'right'],
    [' ', 'jump'],
    ['j', 'attack'],
    ['k', 'block'],
    ['Shift', 'dodge'],
    ['Escape', 'pause'],
    ['h', 'hitboxes'],
  ])('maps %j to %s', (key, action) => {
    expect(map.get(keyInput(key))).toBe(action)
  })

  it('ignores unmapped keys and follows remapping', () => {
    expect(map.get(keyInput('q'))).toBeUndefined()
    const remapped = inputMap(mergeBindings(DEFAULT_CONFIG.input.bindings, { attack: ['z'] }))
    expect(remapped.get(keyInput('z'))).toBe('attack')
    expect(remapped.get(keyInput('j'))).toBeUndefined()
  })
})

describe('sampleActions', () => {
  it('reports held, pressed once, then released', () => {
    const s = createActionSampler()
    down(s, 'j')
    let f = sampleActions(s, map)
    expect([f.held.attack, f.pressed.attack, f.released.attack]).toEqual([true, true, false])
    f = sampleActions(s, map)
    expect([f.held.attack, f.pressed.attack, f.released.attack]).toEqual([true, false, false])
    up(s, 'j')
    f = sampleActions(s, map)
    expect([f.held.attack, f.pressed.attack, f.released.attack]).toEqual([false, false, true])
    f = sampleActions(s, map)
    expect(f.released.attack).toBe(false)
  })

  it('never drops a tap that goes down and up between two steps', () => {
    const s = createActionSampler()
    down(s, 'j')
    up(s, 'j')
    const f = sampleActions(s, map)
    expect([f.held.attack, f.pressed.attack, f.released.attack]).toEqual([false, true, true])
    expect(frameControls(f).attack).toBe(true)
    expect(frameControls(sampleActions(s, map)).attack).toBe(false)
  })

  it('starts exactly one move from a one-frame tap', () => {
    const s = createActionSampler()
    const runner = createMoveRunner()
    down(s, 'j')
    up(s, 'j')
    const started = [0, 1, 2].map(
      () => stepMoveRunner(runner, frameControls(sampleActions(s, map)).attack, SIM_STEP, DEFAULT_CONFIG.moves, DEFAULT_CONFIG.player.lightAttack) === 'started'
    )
    expect(started).toEqual([true, false, false])
  })

  it('ignores key repeat and lets forward and left win over their opposites', () => {
    const s = createActionSampler()
    down(s, 'a')
    sampleActions(s, map)
    down(s, 'a') // repeat
    expect(sampleActions(s, map).pressed.left).toBe(false)
    down(s, 'd')
    down(s, 'w')
    down(s, 's')
    expect(sampleActions(s, map).move).toEqual({ x: -1, z: -1 })
  })

  it('moves for one step on a direction tap', () => {
    const s = createActionSampler()
    down(s, 'd')
    up(s, 'd')
    expect(sampleActions(s, map).move).toEqual({ x: 1, z: 0 })
    expect(sampleActions(s, map).move).toEqual({ x: 0, z: 0 })
  })

  it('releaseAll lets go of everything; dropEdges keeps what is held', () => {
    const s = createActionSampler()
    down(s, 'j')
    down(s, 'k')
    dropEdges(s)
    let f = sampleActions(s, map)
    expect([f.held.attack, f.pressed.attack]).toEqual([true, false])
    releaseAll(s)
    f = sampleActions(s, map)
    expect([f.held.attack, f.held.block, f.released.attack]).toEqual([false, false, true])
  })

  it('remembers the last device that pressed something', () => {
    const s = createActionSampler()
    expect(s.lastDevice).toBe('keyboard')
    inputDown(s, 'pad:a', 'gamepad')
    expect(s.lastDevice).toBe('gamepad')
  })
})
