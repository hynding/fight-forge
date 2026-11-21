// A read-only window into the mounted scene for tools outside it (the Forge
// over a paused playtest, headless checks): where the player stands now, each
// fighter's live runtime, and the frame-time snapshot. GameScene and
// PerfMonitor install the getters on mount and remove them on unmount.

import type { FighterRuntime } from './fighter'
import type { PerfSnapshot } from './perf'

export const sceneProbe: {
  playerX: () => number | null
  runtime: (name: string) => FighterRuntime | null
  /** Frame times and renderer counts (PerfMonitor). */
  perf: () => PerfSnapshot | null
} = {
  playerX: () => null,
  runtime: () => null,
  perf: () => null,
}
