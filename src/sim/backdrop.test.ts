import { describe, expect, it } from 'vitest'
import { backdropShapes, seededRandom, type BackdropLayer } from './backdrop'

const layer = (kind: BackdropLayer['kind'], seed = 7): BackdropLayer => ({ kind, color: '#000000', height: 10, distance: 5, parallax: 0.3, seed })

describe('seededRandom', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const xs = Array.from({ length: 100 }, () => a())
    expect(Array.from({ length: 100 }, () => b())).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(seededRandom(43)()).not.toBe(xs[0])
  })
})

describe('backdropShapes', () => {
  it('is the same for the same seed and different for another', () => {
    expect(backdropShapes(layer('skyline'), 0, 100)).toEqual(backdropShapes(layer('skyline'), 0, 100))
    expect(backdropShapes(layer('skyline', 8), 0, 100)).not.toEqual(backdropShapes(layer('skyline'), 0, 100))
  })

  it('covers the range with shapes no taller than the layer', () => {
    for (const kind of ['skyline', 'hills'] as const) {
      const shapes = backdropShapes(layer(kind), -20, 120)
      expect(shapes[0].x - shapes[0].width / 2).toBeLessThanOrEqual(-20)
      const last = shapes[shapes.length - 1]
      expect(last.x + last.width / 2).toBeGreaterThanOrEqual(120)
      expect(shapes.every((s) => s.height > 0 && s.height <= 10)).toBe(true)
    }
  })

  it('makes a band one strip across the range', () => {
    expect(backdropShapes(layer('band'), -10, 90)).toEqual([{ x: 40, width: 100, height: 10 }])
  })
})
