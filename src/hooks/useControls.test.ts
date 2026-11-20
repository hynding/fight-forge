import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { keyMap, mergeBindings } from '../sim/input'
import { keyToControl } from './useControls'

const map = keyMap(DEFAULT_CONFIG.input.bindings)

describe('keyToControl', () => {
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
  ])('maps %j to %s', (key, control) => {
    expect(keyToControl(key, map)).toBe(control)
  })

  it('ignores unmapped keys and non-gameplay actions', () => {
    expect(keyToControl('Escape', map)).toBeUndefined()
    expect(keyToControl('h', map)).toBeUndefined()
    expect(keyToControl('q', map)).toBeUndefined()
  })

  it('follows remapped bindings', () => {
    const remapped = keyMap(mergeBindings(DEFAULT_CONFIG.input.bindings, { attack: ['z'] }))
    expect(keyToControl('z', remapped)).toBe('attack')
    expect(keyToControl('j', remapped)).toBeUndefined()
  })
})
