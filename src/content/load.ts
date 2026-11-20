// Turning validated packs into content the game can run.

import type { GameConfig } from '../config/defaults'
import type { Level } from '../sim/level'
import { buildRegistry, formatErrors, type ContentRegistry } from './registry'
import type { AssetDef } from './schemas'

export interface LoadedContent {
  registry: ContentRegistry
  config: GameConfig
  levels: Level[]
}

/**
 * Validate packs (in load order) into content the game can run, or the
 * errors. `assetUrl` gives the URL a bundled model loads from (see
 * `ContentRegistry.toGameConfig`).
 */
export const loadContent = (
  packs: unknown[],
  assetUrl?: (asset: AssetDef) => string
): { ok: true; value: LoadedContent } | { ok: false; error: string } => {
  const r = buildRegistry(packs)
  if (!r.ok) return { ok: false, error: formatErrors(r.errors) }
  return { ok: true, value: { registry: r.value, ...r.value.toGameConfig(assetUrl) } }
}
