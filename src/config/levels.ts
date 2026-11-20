import { DEFAULT_CONTENT } from '../content/defaultContent'
import type { Level } from '../sim/level'

/**
 * The default pack's levels (from `content/default/levels.json`), for tests
 * and tools. Gameplay code reads the active levels with `getLevels()` from
 * `src/content/active.ts`.
 */
export const LEVELS: Level[] = DEFAULT_CONTENT.levels
