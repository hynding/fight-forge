import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { actionForKey, getBindings, getOverride, sanitizeOverride, setOverride } from './bindings'

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
    setOverride({ attack: ['z'] })
    expect(actionForKey('z')).toBe('attack')
    expect(actionForKey('j')).toBeUndefined()
    expect(JSON.parse(store.get('fight-forge.input-override.v1')!)).toEqual({ attack: ['z'] })
  })

  it('forget the remapping on reset', () => {
    setOverride({ attack: ['z'] })
    setOverride({})
    expect(store.size).toBe(0)
    expect(getOverride()).toEqual({})
  })
})

describe('sanitizeOverride', () => {
  it('keeps only known actions with key lists', () => {
    expect(sanitizeOverride({ attack: ['Z'], fly: ['f'], jump: 'x', block: [3], dodge: [''] })).toEqual({ attack: ['z'] })
    expect(sanitizeOverride('nonsense')).toEqual({})
    expect(sanitizeOverride(null)).toEqual({})
  })
})
