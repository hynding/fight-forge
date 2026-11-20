// The content the game is running: the default pack until the loading screen
// installs the validated packs for a run. Gameplay code reads config and
// levels through these getters at use time (never captured at module load),
// so a different pack takes effect on the next scene mount.

import type { GameConfig } from '../config/defaults'
import type { Level } from '../sim/level'
import { DEFAULT_CONTENT } from './defaultContent'
import type { LoadedContent } from './load'

let active: LoadedContent = DEFAULT_CONTENT

export const getContent = (): LoadedContent => active
export const getConfig = (): GameConfig => active.config
export const getLevels = (): Level[] => active.levels

export const setActiveContent = (content: LoadedContent): void => {
  active = content
}
