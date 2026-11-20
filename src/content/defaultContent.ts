// The default pack, validated once when the game starts. If the JSON in
// `content/default/` is broken, this throws with every error listed (and the
// content tests fail first).

import { defaultPack } from './defaultPack'
import { loadContent, type LoadedContent } from './load'

const loadDefault = (): LoadedContent => {
  const r = loadContent([defaultPack()])
  if (!r.ok) throw new Error(`The default content pack is invalid:\n${r.error}`)
  return r.value
}

export const DEFAULT_CONTENT: LoadedContent = loadDefault()
