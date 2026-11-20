import { describe, expect, it } from 'vitest'
import { keyToControl } from './useControls'

describe('keyToControl', () => {
  it.each([
    ['w', 'forward'],
    ['W', 'forward'], // Shift held / Caps Lock
    ['s', 'backward'],
    ['a', 'left'],
    ['d', 'right'],
    [' ', 'jump'],
    ['j', 'attack'],
    ['k', 'block'],
    ['Shift', 'dodge'],
  ])('maps %j to %s', (key, control) => {
    expect(keyToControl(key)).toBe(control)
  })

  it('ignores unmapped keys', () => {
    expect(keyToControl('Escape')).toBeUndefined()
    expect(keyToControl('q')).toBeUndefined()
  })
})
