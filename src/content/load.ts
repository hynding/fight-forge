// Turning validated packs into content the game can run.

import type { GameConfig } from '../config/defaults'
import type { Level } from '../sim/level'
import { buildRegistry, formatErrors, type ContentRegistry } from './registry'

export interface LoadedContent {
  registry: ContentRegistry
  config: GameConfig
  levels: Level[]
}

/** Validate packs (in load order) into content the game can run, or the errors. */
export const loadContent = (packs: unknown[]): { ok: true; value: LoadedContent } | { ok: false; error: string } => {
  const r = buildRegistry(packs)
  if (!r.ok) return { ok: false, error: formatErrors(r.errors) }
  return { ok: true, value: { registry: r.value, ...r.value.toGameConfig() } }
}
