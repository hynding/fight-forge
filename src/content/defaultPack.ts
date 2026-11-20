// The default content pack: the JSON files in `content/default/`, put back
// together as one pack. They're bundled with the game; `defaultContent.ts`
// validates them.

import head from '../../content/default/pack.json'
import settings from '../../content/default/settings.json'
import moves from '../../content/default/moves.json'
import ai from '../../content/default/ai.json'
import enemyTypes from '../../content/default/enemy-types.json'
import pickups from '../../content/default/pickups.json'
import levels from '../../content/default/levels.json'

/** The default pack as unvalidated JSON (run it through `buildRegistry`). */
export const defaultPack = (): Record<string, unknown> => ({
  ...head,
  settings,
  moves,
  ai,
  enemyTypes,
  pickups,
  levels,
})
