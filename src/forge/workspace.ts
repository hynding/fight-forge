// The Forge workspace: the packs a creator is making, as editable JSON plus
// their asset files. Pure functions; `storage.ts` saves them and the Forge
// screen edits them. A workspace pack exports to the same bundle format the
// game imports, so "play" is export then install.

import { readBundle, writeBundle } from '../content/bundle'
import { defaultPack } from '../content/defaultPack'
import { buildRegistry, type ContentError, type ContentRegistry, type Result } from '../content/registry'
import { SCHEMA_VERSION } from '../content/schemas'

export type PackJson = Record<string, unknown>

export interface WorkspacePack {
  /** The pack's id, fixed when it's created; also its key in storage. */
  id: string
  json: PackJson
  /** Asset files by their path inside the bundle. */
  files: Record<string, Uint8Array>
  /** Milliseconds since the epoch. */
  updatedAt: number
}

/** "My Cool Pack!" → "my-cool-pack". Always a valid pack id. */
export const slugify = (name: string): string => {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z]/.test(s) ? s : `pack-${s}`.replace(/-$/, '')
}

/** `base`, or `base-2`, `base-3`… whichever is free (never the built-in "default"). */
export const uniqueId = (base: string, taken: Iterable<string>): string => {
  const used = new Set(taken)
  used.add('default')
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

/** A blank pack: metadata only, inheriting everything from the default pack. */
export const newPack = (name: string, taken: Iterable<string>, now = Date.now()): WorkspacePack => {
  const id = uniqueId(slugify(name || 'pack'), taken)
  return {
    id,
    json: {
      schemaVersion: SCHEMA_VERSION,
      id,
      name: name || id,
      version: '1.0.0',
      meta: { author: 'Anonymous', description: '', license: 'All rights reserved' },
    },
    files: {},
    updatedAt: now,
  }
}

export const duplicatePack = (wp: WorkspacePack, taken: Iterable<string>, now = Date.now()): WorkspacePack => {
  const id = uniqueId(wp.id, taken)
  const name = typeof wp.json.name === 'string' ? `${wp.json.name} copy` : id
  return { id, json: { ...structuredClone(wp.json), id, name }, files: { ...wp.files }, updatedAt: now }
}

/** Replace the pack's JSON (an edit), keeping its id. */
export const editPack = (wp: WorkspacePack, json: PackJson, now = Date.now()): WorkspacePack => ({
  ...wp,
  json: { ...json, id: wp.id },
  updatedAt: now,
})

/**
 * Turn a bundle into a workspace pack. The pack is upgraded to the current
 * schema (the editor's forms are for that). Its id is kept unless taken.
 */
export const importBundle = async (zip: Uint8Array, taken: Iterable<string>, now = Date.now()): Promise<Result<WorkspacePack>> => {
  const r = await readBundle(zip)
  if (!r.ok) return r
  const { pack, files } = r.value
  const id = uniqueId(pack.id, taken)
  const byPath: Record<string, Uint8Array> = {}
  for (const a of pack.assets) {
    const bytes = files.get(a.id)
    if (bytes) byPath[a.path] = bytes
  }
  return { ok: true, value: { id, json: { ...(structuredClone(pack) as PackJson), id }, files: byPath, updatedAt: now } }
}

/** The pack as a bundle file, ready to share or play. */
export const exportBundle = (wp: WorkspacePack): Promise<Uint8Array> =>
  writeBundle(wp.json, new Map(Object.entries(wp.files)))

/** The default pack, validated once: what a workspace pack inherits from. */
let base: ContentRegistry | undefined
export const baseContent = (): ContentRegistry => {
  if (!base) {
    const r = buildRegistry([defaultPack()])
    if (!r.ok) throw new Error('the default pack is invalid')
    base = r.value
  }
  return base
}

/** Problems with the pack as it would load on top of the default pack. */
export const validatePack = (json: PackJson): ContentError[] => {
  const r = buildRegistry([defaultPack(), json])
  return r.ok ? [] : r.errors.filter((e) => e.pack === undefined || e.pack === json.id)
}
