import { EnemyType } from '../types/game'
import type { Level } from '../sim/level'

const { BASIC, FAST, HEAVY, FLANKER } = EnemyType

/**
 * The first hand-written level, as data shaped like the future content schema.
 * Three segments: a warm-up, a street fight with two locked brawls, and a
 * final brawl before the goal.
 */
export const DEFAULT_LEVEL: Level = {
  id: 'level-1',
  name: 'Back Alley',
  segments: [
    {
      length: 45,
      triggers: [
        {
          // At the very start, so these two are already standing there.
          kind: 'wave',
          at: 0,
          waves: [
            {
              enemies: [
                { type: BASIC, from: 'placed', x: 12, depth: 0.3 },
                { type: BASIC, from: 'placed', x: 15, depth: 0.7 },
              ],
            },
          ],
        },
        {
          kind: 'wave',
          at: 32,
          lock: true,
          waves: [
            {
              enemies: [
                { type: BASIC, from: 'right', depth: 0.2 },
                { type: BASIC, from: 'right', depth: 0.8, delay: 0.5 },
                { type: FAST, from: 'left', depth: 0.5, delay: 1.5 },
              ],
            },
            {
              enemies: [
                { type: FAST, from: 'right', depth: 0.3 },
                { type: BASIC, from: 'left', depth: 0.7, delay: 0.8 },
              ],
            },
          ],
        },
      ],
    },
    {
      length: 50,
      items: [{ at: 5, pickup: 'coin', depth: 0.3 }],
      triggers: [
        {
          kind: 'wave',
          at: 15,
          waves: [
            {
              enemies: [
                { type: FAST, from: 'right', depth: 0.2 },
                { type: FAST, from: 'right', depth: 0.8, delay: 1 },
              ],
            },
          ],
        },
        {
          kind: 'wave',
          at: 38,
          lock: true,
          waves: [
            {
              enemies: [
                { type: HEAVY, from: 'right', depth: 0.5 },
                { type: FLANKER, from: 'left', depth: 0.2, delay: 1 },
                { type: BASIC, from: 'right', depth: 0.8, delay: 2 },
              ],
            },
          ],
        },
      ],
    },
    {
      length: 40,
      items: [{ at: 8, pickup: 'food', depth: 0.6 }],
      triggers: [
        {
          kind: 'wave',
          at: 18,
          lock: true,
          waves: [
            {
              enemies: [
                { type: BASIC, from: 'right', depth: 0.2 },
                { type: FAST, from: 'left', depth: 0.8, delay: 0.5 },
                { type: BASIC, from: 'right', depth: 0.6, delay: 1.5 },
              ],
            },
            {
              enemies: [
                { type: HEAVY, from: 'right', depth: 0.3 },
                { type: FLANKER, from: 'left', depth: 0.7, delay: 1 },
                { type: FAST, from: 'right', depth: 0.9, delay: 2 },
              ],
            },
          ],
        },
        { kind: 'goal', at: 36 },
      ],
    },
  ],
}

/** Level 2: a longer run along the docks with bigger mixed fights. */
export const DOCKS_LEVEL: Level = {
  id: 'level-2',
  name: 'The Docks',
  segments: [
    {
      length: 40,
      items: [{ at: 20, pickup: 'coin', depth: 0.8 }],
      triggers: [
        {
          kind: 'wave',
          at: 0,
          waves: [{ enemies: [{ type: FAST, from: 'placed', x: 14, depth: 0.4 }] }],
        },
        {
          kind: 'wave',
          at: 30,
          lock: true,
          waves: [
            {
              enemies: [
                { type: BASIC, from: 'right', depth: 0.3 },
                { type: FLANKER, from: 'left', depth: 0.7, delay: 1 },
              ],
            },
            {
              enemies: [
                { type: FAST, from: 'right', depth: 0.2 },
                { type: FAST, from: 'left', depth: 0.8, delay: 0.5 },
                { type: BASIC, from: 'right', depth: 0.5, delay: 1.5 },
              ],
            },
          ],
        },
      ],
    },
    {
      length: 45,
      items: [
        { at: 6, pickup: 'food', depth: 0.2 },
        { at: 30, pickup: 'coin', depth: 0.5 },
      ],
      triggers: [
        {
          kind: 'wave',
          at: 20,
          lock: true,
          waves: [
            {
              enemies: [
                { type: HEAVY, from: 'right', depth: 0.4 },
                { type: FLANKER, from: 'left', depth: 0.8, delay: 1 },
                { type: FLANKER, from: 'right', depth: 0.1, delay: 2 },
              ],
            },
          ],
        },
      ],
    },
    {
      length: 35,
      items: [{ at: 4, pickup: 'feast', depth: 0.5 }],
      triggers: [
        {
          kind: 'wave',
          at: 15,
          lock: true,
          waves: [
            {
              enemies: [
                { type: HEAVY, from: 'right', depth: 0.3 },
                { type: HEAVY, from: 'left', depth: 0.7, delay: 1 },
              ],
            },
            {
              enemies: [
                { type: FAST, from: 'right', depth: 0.2 },
                { type: FLANKER, from: 'left', depth: 0.6, delay: 0.5 },
                { type: BASIC, from: 'right', depth: 0.9, delay: 1 },
                { type: BASIC, from: 'left', depth: 0.4, delay: 2 },
              ],
            },
          ],
        },
        { kind: 'goal', at: 31 },
      ],
    },
  ],
}

/** The levels of the default content, in play order. */
export const LEVELS: Level[] = [DEFAULT_LEVEL, DOCKS_LEVEL]
