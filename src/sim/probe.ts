// A read-only window into the mounted scene for tools outside it (the Forge
// over a paused playtest, headless checks): where the player stands now, and
// each fighter's live runtime. GameScene installs the getters on mount and
// removes them on unmount.

import type { FighterRuntime } from './fighter'

export const sceneProbe: { playerX: () => number | null; runtime: (name: string) => FighterRuntime | null } = {
  playerX: () => null,
  runtime: () => null,
}
