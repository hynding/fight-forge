// Builds the sample pack bundles in content/samples/<name>/ (a pack.json plus
// its asset files) into public/packs/<name>.zip, so the start menu can load
// them by URL. Runs before `dev` and `build`; the zips aren't committed.
//
//   npm run pack:sample

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundleFromFolder } from '../src/content/bundleFolder'

const samples = 'content/samples'
const out = 'public/packs'
mkdirSync(out, { recursive: true })
for (const name of readdirSync(samples)) {
  const zip = await bundleFromFolder(
    join(samples, name),
    (p) => new Uint8Array(readFileSync(p)),
    (folder) => readdirSync(folder)
  )
  writeFileSync(join(out, `${name}.zip`), zip)
  console.log(`${out}/${name}.zip: ${zip.length} bytes`)
}
