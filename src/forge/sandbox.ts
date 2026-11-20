// The Forge sandbox: a short generated level that drops you straight into a
// fight with N enemies of one type, to try a tuning change in seconds.

import type { Level } from '../sim/level'

export const SANDBOX_MAX = 8

/** Starting position ranges for enemy tuning sliders: [min, max, step]. Typing a value past them still works. */
export const ENEMY_SLIDERS: Record<string, [number, number, number]> = {
  maxHealth: [1, 500, 1],
  speed: [0, 12, 0.1],
  aggression: [0, 3, 0.05],
  scale: [0.3, 3, 0.05],
  armor: [0, 1, 0.05],
}

export const AI_SLIDERS: Record<string, [number, number, number]> = {
  reach: [0.3, 5, 0.05],
  standOff: [0.3, 8, 0.1],
}

/**
 * A one-screen arena: `count` enemies of `type` stand a few steps away and
 * the screen locks as soon as the run starts; beating them opens the way to
 * the goal.
 */
export const sandboxLevel = (type: string, count: number, theme = 'default'): Level => {
  const n = Math.max(1, Math.min(SANDBOX_MAX, Math.round(count)))
  return {
    id: 'forge-sandbox',
    name: `Sandbox: ${n} × ${type}`,
    theme,
    segments: [
      {
        // The goal is past the locked screen, so it can't be reached until the fight is won.
        length: 30,
        triggers: [
          {
            kind: 'wave',
            at: 3,
            lock: true,
            waves: [
              {
                // Already on screen, a short walk to the right, spread in depth.
                enemies: Array.from({ length: n }, (_, i) => ({
                  type,
                  from: 'placed' as const,
                  x: 4 + i,
                  depth: [0.5, 0.25, 0.75][i % 3],
                })),
              },
            ],
          },
          { kind: 'goal', at: 28 },
        ],
      },
    ],
  }
}
