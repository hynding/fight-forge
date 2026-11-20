// The pack library: imported pack bundles, which of them are enabled, and
// turning the enabled set (on top of the default pack) into the active
// content. Bundle bytes live here; the store only holds the summaries the
// menu shows. Packs last for the session (saving them is M3.1's workspace).

import { useGameStore, type PackSummary } from '../store/gameStore'
import { setActiveContent } from './active'
import { readBundle, writeBundle, type Bundle } from './bundle'
import { defaultPack } from './defaultPack'
import { loadContent, type LoadedContent } from './load'
import { buildRegistry, formatErrors, type ContentError, type Result } from './registry'
import type { AssetDef } from './schemas'

interface Installed {
  bundle: Bundle
  zip: Uint8Array
  enabled: boolean
}

const installed: Installed[] = []
// Blob URLs for bundled assets, made once per pack and asset.
const blobUrls = new Map<string, string>()

const MIME: Record<AssetDef['kind'], string> = {
  model: 'model/gltf-binary',
  texture: 'application/octet-stream',
  audio: 'application/octet-stream',
}

const enabled = () => installed.filter((p) => p.enabled)

/** The packs to load, in order: the default pack, then each enabled pack. */
export const activePackInputs = (): unknown[] => [defaultPack(), ...enabled().map((p) => p.bundle.json)]

/** Where a bundled asset loads from: a blob URL of the last enabled pack that defines it. */
const assetUrl = (asset: AssetDef): string => {
  const owner = [...enabled()].reverse().find((p) => p.bundle.files.has(asset.id))
  if (!owner) return asset.path
  const key = `${owner.bundle.pack.id}:${asset.id}`
  let url = blobUrls.get(key)
  if (!url) {
    const bytes = owner.bundle.files.get(asset.id)!
    url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[asset.kind] }))
    blobUrls.set(key, url)
  }
  return url
}

/** Validate the enabled packs together into content the game can run. */
export const loadActivePacks = (): { ok: true; value: LoadedContent } | { ok: false; error: string } =>
  loadContent(activePackInputs(), assetUrl)

const summary = (p: Installed): PackSummary => ({
  id: p.bundle.pack.id,
  name: p.bundle.pack.name,
  version: p.bundle.pack.version,
  author: p.bundle.pack.meta.author,
  description: p.bundle.pack.meta.description,
  enabled: p.enabled,
})

/** Re-validate the enabled packs, install them as the active content, and update the menu. */
const apply = (): void => {
  const r = loadActivePacks()
  if (r.ok) setActiveContent(r.value)
  useGameStore.getState().setPacks(installed.map(summary), r.ok ? null : r.error)
}

/**
 * Import a bundle. It must be valid alone and together with the default pack
 * and the packs already enabled; a pack with the same id as an installed one
 * replaces it (a newer version, say). On success it's enabled.
 */
export const installBundle = async (zip: Uint8Array): Promise<Result<PackSummary>> => {
  const read = await readBundle(zip)
  if (!read.ok) return read
  const bundle = read.value
  const id = bundle.pack.id
  if (id === 'default') return { ok: false, errors: [{ pack: id, path: 'id', message: 'the id "default" is the built-in pack\'s' }] }
  const others = enabled().filter((p) => p.bundle.pack.id !== id)
  const check = buildRegistry([defaultPack(), ...others.map((p) => p.bundle.json), bundle.json])
  if (!check.ok) return check

  const existing = installed.findIndex((p) => p.bundle.pack.id === id)
  if (existing >= 0) {
    forgetBlobs(id)
    installed[existing] = { bundle, zip, enabled: true }
  } else installed.push({ bundle, zip, enabled: true })
  apply()
  return { ok: true, value: summary(installed.find((p) => p.bundle.pack.id === id)!) }
}

/** Fetch a bundle from a URL and import it. */
export const installBundleFromUrl = async (url: string): Promise<Result<PackSummary>> => {
  let bytes: Uint8Array
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    return { ok: false, errors: [{ path: url, message: `couldn't download (${e instanceof Error ? e.message : String(e)})` }] }
  }
  return installBundle(bytes)
}

export const setPackEnabled = (id: string, on: boolean): void => {
  const p = installed.find((x) => x.bundle.pack.id === id)
  if (!p) return
  p.enabled = on
  apply()
}

const forgetBlobs = (id: string) => {
  for (const [key, url] of blobUrls)
    if (key.startsWith(`${id}:`)) {
      URL.revokeObjectURL(url)
      blobUrls.delete(key)
    }
}

export const removePack = (id: string): void => {
  const i = installed.findIndex((x) => x.bundle.pack.id === id)
  if (i < 0) return
  installed.splice(i, 1)
  forgetBlobs(id)
  apply()
}

/** An installed pack's bundle file, as imported. */
export const packBundleBytes = (id: string): Uint8Array | undefined => installed.find((x) => x.bundle.pack.id === id)?.zip

/** The default pack as a bundle: a starting point for making a pack. */
export const defaultPackBundle = (): Promise<Uint8Array> => writeBundle(defaultPack())

export const describeErrors = (errors: ContentError[]): string => formatErrors(errors)
