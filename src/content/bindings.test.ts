import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { actionForKey, getBindings, getOverride, reloadOverride, sanitizeOverride, setDeviceOverride, setOverride } from './bindings'

// A minimal localStorage for the node test environment.
const store = new Map<string, string>()
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage
})
afterEach(() => {
  setOverride({})
  store.clear()
  delete (globalThis as { localStorage?: unknown }).localStorage
})

describe('key bindings in effect', () => {
  it("are the pack's until the player remaps", () => {
    expect(getBindings()).toEqual(DEFAULT_CONFIG.input.bindings)
    expect(actionForKey('Escape')).toBe('pause')
  })

  it('apply the remapping and remember it in localStorage', () => {
    setOverride({ keyboard: { attack: ['z'] } })
    expect(actionForKey('z')).toBe('attack')
    expect(actionForKey('j')).toBeUndefined()
    expect(JSON.parse(store.get('fight-forge.input-override.v2')!)).toEqual({ keyboard: { attack: ['z'] } })
  })

  it('keep each device separate', () => {
    setDeviceOverride('gamepad', { jump: ['b'] })
    setDeviceOverride('mouse', { block: ['middle'] })
    const b = getBindings()
    expect(b.gamepad.jump).toEqual(['b'])
    expect(b.mouse.block).toEqual(['middle'])
    expect(b.keyboard).toEqual(DEFAULT_CONFIG.input.bindings.keyboard)
    setDeviceOverride('gamepad', {})
    expect(getOverride()).toEqual({ mouse: { block: ['middle'] } })
  })

  it('forget the remapping on reset', () => {
    setOverride({ keyboard: { attack: ['z'] } })
    setOverride({})
    expect(store.size).toBe(0)
    expect(getOverride()).toEqual({})
  })
})

describe('sanitizeOverride', () => {
  it('keeps only known devices and actions with valid input lists', () => {
    expect(sanitizeOverride({ keyboard: { attack: ['Z'], fly: ['f'], jump: 'x', block: [3], dodge: [''] } })).toEqual({ keyboard: { attack: ['z'] } })
    expect(sanitizeOverride({ mouse: { attack: ['left'], block: ['thumb'] }, gamepad: { jump: ['a'], dodge: ['b3'], block: ['nope'] }, joystick: {} })).toEqual({
      mouse: { attack: ['left'] },
      gamepad: { jump: ['a'], dodge: ['b3'] },
    })
    expect(sanitizeOverride('nonsense')).toEqual({})
    expect(sanitizeOverride(null)).toEqual({})
  })
})

describe('an older, keyboard-only remapping', () => {
  it('is moved into the keyboard once', () => {
    setOverride({})
    store.set('fight-forge.input-override.v1', JSON.stringify({ attack: ['z'] }))
    reloadOverride()
    expect(getOverride()).toEqual({ keyboard: { attack: ['z'] } })
    expect(actionForKey('z')).toBe('attack')
    expect(store.has('fight-forge.input-override.v1')).toBe(false)
    expect(JSON.parse(store.get('fight-forge.input-override.v2')!)).toEqual({ keyboard: { attack: ['z'] } })
  })
})
