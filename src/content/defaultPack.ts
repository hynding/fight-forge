// The default content pack, assembled from the TS definitions in
// `src/config`. M2.2 replaces this with JSON files under `content/default/`.

import { DEFAULT_CONFIG } from '../config/defaults'
import { LEVELS } from '../config/levels'
import { SCHEMA_VERSION, type PackInput } from './schemas'

export const defaultPack = (): PackInput => {
  const { enemyTypes, ai, moves, pickups, ...settings } = DEFAULT_CONFIG
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'default',
    name: 'Fight Forge',
    version: '1.0.0',
    meta: {
      author: 'Fight Forge',
      description: 'The built-in fighters, enemies and levels.',
      license: 'MIT',
    },
    settings,
    moves,
    ai,
    enemyTypes,
    pickups,
    levels: LEVELS,
  }
}
