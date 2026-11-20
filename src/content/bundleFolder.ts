// Building a bundle from a pack folder (pack.json plus its asset files), for
// the sample-pack script and tests. File reading is passed in, so this module
// stays free of Node APIs.

import { writeBundle } from './bundle'

/**
 * Bundle `dir/pack.json` with every asset it lists, plus any LICENSE files
 * in the asset folders. `list` returns the file names in a folder.
 */
export const bundleFromFolder = async (
  dir: string,
  read: (path: string) => Uint8Array,
  list: (folder: string) => string[]
): Promise<Uint8Array> => {
  const pack = JSON.parse(new TextDecoder().decode(read(`${dir}/pack.json`))) as Record<string, unknown>
  const assets = (pack.assets ?? []) as { path: string }[]
  const files = new Map(assets.map((a) => [a.path, read(`${dir}/${a.path}`)]))
  const extras: Record<string, Uint8Array> = {}
  for (const a of assets) {
    const folder = a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/') + 1) : ''
    for (const name of list(`${dir}/${folder}`))
      if (/^LICENSE/i.test(name)) extras[folder + name] = read(`${dir}/${folder}${name}`)
  }
  return writeBundle(pack, files, extras)
}
