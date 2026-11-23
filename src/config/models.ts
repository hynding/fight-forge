import type { GameConfig, ModelRef } from './defaults'

/** Every distinct glTF URL a config uses, for preloading. */
export const gltfModelUrls = (config: GameConfig): string[] => {
  const refs: ModelRef[] = [config.player.model, ...(config.coop.p2Model ? [config.coop.p2Model] : []), ...Object.values(config.enemyTypes).map((t) => t.model)]
  return [...new Set(refs.flatMap((m) => (m.kind === 'gltf' ? [m.url] : [])))]
}
