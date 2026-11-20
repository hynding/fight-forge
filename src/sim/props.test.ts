import { describe, expect, it } from 'vitest'
import { propBox, type PropDef } from './props'

const crate: PropDef = { shape: 'box', size: [1, 2, 3], color: '#000000', solid: true }

describe('propBox', () => {
  it('stands the prop on the floor (plus its own height above it)', () => {
    expect(propBox({ x: 5, y: 0, z: -1 }, crate, 0.25)).toEqual({
      center: { x: 5, y: 1.25, z: -1 },
      half: { x: 0.5, y: 1, z: 1.5 },
    })
    expect(propBox({ x: 5, y: 2, z: -1 }, crate, 0.25).center.y).toBe(3.25)
  })

  it('uses the diameter for both ground axes of a cylinder', () => {
    expect(propBox({ x: 0, y: 0, z: 0 }, { ...crate, shape: 'cylinder', size: [0.8, 1, 9] }, 0).half).toEqual({ x: 0.4, y: 0.5, z: 0.4 })
  })
})
