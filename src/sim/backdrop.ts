// Backdrop shapes for a theme's parallax layers: silhouettes behind the back
// wall, generated from a seed so a level always looks the same. Pure TS.

export interface BackdropLayer {
  /** `skyline`: boxy buildings or cranes; `hills`: rounded mounds; `band`: one flat strip (sea, horizon). */
  kind: 'skyline' | 'hills' | 'band'
  color: string
  /** Tallest shape (world units). */
  height: number
  /** How far behind the back wall. */
  distance: number
  /** 0 = fixed to the world, 1 = fixed to the screen; in between scrolls slower than the stage. */
  parallax: number
  seed: number
}

/** A shape in layer space: centre X, width, height (its base sits on the floor). */
export interface BackdropShape {
  x: number
  width: number
  height: number
}

/** A small deterministic PRNG (mulberry32): the same seed gives the same sequence. */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The shapes covering [from, to] in layer space. A parallax layer moves with
 * the camera, so it needs to span the level's length times (1 - parallax)
 * plus a screen either side; callers pass that range.
 */
export const backdropShapes = (layer: BackdropLayer, from: number, to: number): BackdropShape[] => {
  if (layer.kind === 'band') return [{ x: (from + to) / 2, width: to - from, height: layer.height }]
  const rand = seededRandom(layer.seed)
  const shapes: BackdropShape[] = []
  let x = from
  while (x < to) {
    const width = layer.kind === 'skyline' ? 1.5 + rand() * 3.5 : 6 + rand() * 10
    const height = layer.height * (0.35 + rand() * 0.65)
    shapes.push({ x: x + width / 2, width, height })
    // Skylines pack tightly with small gaps; hills overlap.
    x += layer.kind === 'skyline' ? width + rand() * 0.8 : width * 0.6
  }
  return shapes
}
