import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { actionLabel, bindingConflicts, controlsHelp, keyLabel, keyMap, mergeBindings, rebind, type Bindings } from './input'

const base: Bindings = DEFAULT_CONFIG.input.bindings

describe('mergeBindings', () => {
  it('is the pack bindings without an override', () => {
    expect(mergeBindings(base)).toEqual(base)
  })

  it("replaces an action's keys and takes moved keys off other actions", () => {
    const b = mergeBindings(base, { jump: ['j'] })
    expect(b.jump).toEqual(['j'])
    expect(b.attack).toEqual([])
    expect(b.left).toEqual(base.left)
  })

  it('lowercases keys', () => {
    expect(mergeBindings(base, { jump: ['Z'] }).jump).toEqual(['z'])
  })
})

describe('keyMap', () => {
  it('maps every bound key to its action', () => {
    const map = keyMap(base)
    expect(map.get('a')).toBe('left')
    expect(map.get('arrowleft')).toBe('left')
    expect(map.get(' ')).toBe('jump')
    expect(map.get('escape')).toBe('pause')
    expect(map.get('h')).toBe('hitboxes')
  })
})

describe('bindingConflicts', () => {
  it('finds none in the defaults', () => {
    expect(bindingConflicts(base)).toEqual([])
  })

  it('lists a key bound twice', () => {
    expect(bindingConflicts({ ...base, block: ['k', 'j'] })).toEqual([{ key: 'j', actions: ['attack', 'block'] }])
  })
})

describe('rebind', () => {
  it('binds one key to an action and swaps it off the action that had it', () => {
    const o = rebind({}, base, 'attack', 'K')
    expect(o).toEqual({ attack: ['k'], block: [] })
    expect(bindingConflicts(mergeBindings(base, o))).toEqual([])
  })

  it('builds on an earlier override', () => {
    const o = rebind(rebind({}, base, 'attack', 'z'), base, 'jump', 'x')
    expect(mergeBindings(base, o)).toMatchObject({ attack: ['z'], jump: ['x'] })
  })
})

describe('labels', () => {
  it('names keys for the screen', () => {
    expect(keyLabel(' ')).toBe('SPACE')
    expect(keyLabel('arrowleft')).toBe('←')
    expect(keyLabel('j')).toBe('J')
    expect(actionLabel(base, 'left')).toBe('A / ←')
    expect(actionLabel({ ...base, block: [] }, 'block')).toBe('—')
  })

  it('writes the controls help from the bindings', () => {
    expect(controlsHelp(base, true)).toBe(
      'A/D - Move (double-tap to run) | W/S - Depth | SPACE - Jump | J - Attack (tap for combo) | K - Block | SHIFT - Dodge | ESC - Pause'
    )
    expect(controlsHelp(mergeBindings(base, { attack: ['z'] }))).toContain('Z - Attack |')
  })
})
