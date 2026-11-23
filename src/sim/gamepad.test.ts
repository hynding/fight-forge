import { describe, expect, it } from 'vitest'
import { choosePad, padChanges, padInputs, padStick, type PadLike } from './gamepad'
import { inputLabel, labelSetFor, padHelp } from './input'
import { DEFAULT_CONFIG } from '../config/defaults'

const pad = (over: Partial<PadLike> & { down?: number[] } = {}): PadLike => {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: !!over.down?.includes(i), value: over.down?.includes(i) ? 1 : 0 }))
  return { index: 0, id: 'Xbox Wireless Controller', mapping: 'standard', connected: true, buttons, axes: [0, 0, 0, 0], ...over }
}

describe('padInputs', () => {
  it('names standard buttons and stick directions', () => {
    expect([...padInputs(pad({ down: [0, 9, 14] }))].sort()).toEqual(['a', 'left', 'start'])
    expect([...padInputs(pad({ axes: [0.9, -0.7, 0, 0.6] }))].sort()).toEqual(['ls-right', 'ls-up', 'rs-down'])
    expect(padInputs(pad({ axes: [0.3, 0, 0, 0] })).size).toBe(0)
  })
  it('counts an analog trigger pulled past halfway', () => {
    const p = pad()
    const buttons = p.buttons.map((b, i) => (i === 7 ? { pressed: false, value: 0.8 } : b))
    expect(padInputs({ ...p, buttons }).has('rt')).toBe(true)
  })
  it('gives a non-standard pad raw names plus a best guess by position', () => {
    const raw = pad({ mapping: '', down: [2], axes: [0, 0, 0, 0, -1] })
    expect([...padInputs(raw)].sort()).toEqual(['axis4-', 'b2', 'x'])
  })
})

describe('padStick', () => {
  it('is zero inside the dead zone and rescaled outside it', () => {
    expect(padStick(pad({ axes: [0.15, 0.1, 0, 0] }), 0.2)).toEqual({ x: 0, z: 0 })
    const full = padStick(pad({ axes: [1, 0, 0, 0] }), 0.2)
    expect(full.x).toBeCloseTo(1)
    const half = padStick(pad({ axes: [0.6, 0, 0, 0] }), 0.2)
    expect(half.x).toBeCloseTo(0.5)
    // Up on the stick is into the screen, like W.
    expect(padStick(pad({ axes: [0, -1, 0, 0] }), 0.2).z).toBeCloseTo(-1)
  })
})

describe('choosing player 1', () => {
  it('takes the first pad to press something and keeps it', () => {
    const idle = pad({ index: 0 })
    const pressing = pad({ index: 1, down: [0] })
    expect(choosePad([idle, null], null)).toBeNull()
    expect(choosePad([idle, pressing], null)?.index).toBe(1)
    expect(choosePad([pad({ index: 0, down: [0] }), pad({ index: 1 })], 1)?.index).toBe(1)
  })
  it('lets another pad take over when the one in use is gone', () => {
    expect(choosePad([pad({ index: 0, down: [1] })], 1)?.index).toBe(0)
    expect(choosePad([pad({ index: 1, connected: false })], 1)).toBeNull()
  })
  it("never takes player 2's pad", () => {
    expect(choosePad([pad({ index: 0, down: [0] }), pad({ index: 1 })], null, new Set([0]))).toBeNull()
    expect(choosePad([pad({ index: 0, down: [0] })], 1, new Set([0]))).toBeNull()
  })
  it('reports buttons that went down and up', () => {
    expect(padChanges(new Set(['a', 'x']), new Set(['x', 'b']))).toEqual({ down: ['b'], up: ['a'] })
  })
})

describe('labels', () => {
  it('picks a label set from the pad id', () => {
    expect(labelSetFor('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox')
    expect(labelSetFor('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation')
    expect(labelSetFor('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo')
    expect(labelSetFor('USB Gamepad')).toBe('generic')
  })
  it('names buttons in each set', () => {
    expect(inputLabel('gamepad', 'a')).toBe('A')
    expect(inputLabel('gamepad', 'a', 'playstation')).toBe('✕')
    expect(inputLabel('gamepad', 'a', 'nintendo')).toBe('B')
    expect(inputLabel('gamepad', 'ls-left')).toBe('LS ←')
    expect(inputLabel('gamepad', 'b7')).toBe('BUTTON 7')
  })
  it('writes controller help', () => {
    expect(padHelp(DEFAULT_CONFIG.input.bindings.gamepad, 'playstation', true)).toBe(
      'Stick / D-pad - Move (push all the way to run) | ✕ - Jump | □ - Attack (tap for combo) | L1 - Block | R1 - Dodge | OPTIONS - Pause'
    )
  })
})
