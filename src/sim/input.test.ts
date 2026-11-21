import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import {
  actionEnabled,
  actionLabel,
  bindingConflicts,
  controlsHelp,
  enabledActions,
  helpExtras,
  keyLabel,
  keyMap,
  mergeBindings,
  padHelp,
  rebind,
  type ActionSettings,
  type Bindings,
} from './input'

const base: Bindings = DEFAULT_CONFIG.input.bindings.keyboard

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

describe('optional actions', () => {
  const on = DEFAULT_CONFIG.input.actions
  const off: ActionSettings = { heavy: { enabled: false }, special: { enabled: false }, run: { mode: 'doubleTap' }, block: { mode: 'toggle' } }

  it('turns heavy, special and the run button on and off', () => {
    expect(enabledActions(on)).toContain('heavy')
    expect(enabledActions(off)).not.toEqual(expect.arrayContaining(['heavy']))
    expect(enabledActions(off).filter((a) => ['heavy', 'special', 'run'].includes(a))).toEqual([])
    expect(actionEnabled(off, 'block')).toBe(true)
    expect(actionEnabled({ ...off, run: { mode: 'hold' } }, 'run')).toBe(true)
    expect(helpExtras(on)).toEqual(['heavy', 'special', 'run'])
    expect(helpExtras(off)).toEqual([])
  })

  it('adds the extras to the help text after Attack, and Run after Dodge on the keyboard', () => {
    const text = controlsHelp(base, true, helpExtras(on))
    expect(text).toBe(
      'A/D - Move | W/S - Depth | SPACE - Jump | J - Attack (tap for combo) | L - Heavy | I - Special | K - Block | SHIFT - Dodge | Q - Run | ESC - Pause'
    )
    const pad = padHelp(DEFAULT_CONFIG.input.bindings.gamepad, 'xbox', false, helpExtras(on))
    expect(pad).toContain('Y - Heavy')
    expect(pad).not.toContain('Run')
  })
})
