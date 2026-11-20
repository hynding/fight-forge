// Pack assets in the Forge: adding a cover image, and finding where each
// asset is used so the creator can tell what's safe to remove.

import { BUNDLE_LIMITS, imageType } from '../content/bundle'
import { assetsOf, fileStem } from './fighter'
import { pathString } from './paths'
import { uniqueId, type PackJson, type WorkspacePack } from './workspace'

/**
 * Add a PNG, JPEG or WebP image to the pack as a texture asset. Returns the
 * new pack and the asset's id, or why the file can't be used.
 */
export const addImageAsset = (
  wp: WorkspacePack,
  filename: string,
  bytes: Uint8Array
): { ok: true; pack: WorkspacePack; assetId: string } | { ok: false; message: string } => {
  const type = imageType(bytes)
  if (!type) return { ok: false, message: `"${filename}" isn't a PNG, JPEG or WebP image` }
  if (bytes.length > BUNDLE_LIMITS.texture)
    return { ok: false, message: `"${filename}" is ${bytes.length} bytes; images can be up to ${BUNDLE_LIMITS.texture}` }
  const assets = assetsOf(wp.json)
  const id = uniqueId(fileStem(filename, 'image'), assets.map((a) => String(a.id)))
  const path = `images/${id}.${type === 'jpeg' ? 'jpg' : type}`
  const json = { ...wp.json, assets: [...assets, { id, kind: 'texture', path }] }
  return { ok: true, pack: { ...wp, json, files: { ...wp.files, [path]: bytes }, updatedAt: Date.now() }, assetId: id }
}

/** Make an image asset the pack's cover (or clear it with undefined). */
export const setCover = (json: PackJson, assetId: string | undefined): PackJson => {
  const meta = { ...((json.meta ?? {}) as Record<string, unknown>) }
  if (assetId === undefined) delete meta.cover
  else meta.cover = assetId
  return { ...json, meta }
}

/** Where each asset id is used in the pack: the paths of models that load it, and `meta.cover`. */
export const assetUsage = (json: PackJson): Map<string, string[]> => {
  const uses = new Map<string, string[]>()
  const add = (id: string, where: string) => uses.set(id, [...(uses.get(id) ?? []), where])
  const walk = (v: unknown, path: (string | number)[]) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]))
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (path[0] !== 'assets' && typeof o.asset === 'string') add(o.asset, pathString(path))
      for (const [k, x] of Object.entries(o)) walk(x, [...path, k])
    }
  }
  walk(json, [])
  const cover = (json.meta as Record<string, unknown> | undefined)?.cover
  if (typeof cover === 'string') add(cover, 'meta.cover')
  return uses
}

/** A data or blob URL is made by the caller; this gives the MIME type for an image's bytes. */
export const imageMime = (bytes: Uint8Array): string => `image/${imageType(bytes) ?? 'png'}`
