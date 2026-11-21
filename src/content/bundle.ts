// Pack bundles: one zip file holding a pack's `pack.json` and its asset files
// (models, textures, audio), referenced by path inside the zip and checked by
// size and SHA-256. This is the format packs are shared in, by file, URL and
// later the online service. Reading never runs anything from the bundle: it
// is data, validated like any other pack.

import { unzipSync, zipSync, type Unzipped } from 'fflate'
import { parsePack, type ContentError, type Result } from './registry'
import type { AssetDef, Pack } from './schemas'

export const PACK_FILE = 'pack.json'

/** Size limits in bytes, checked before anything is decompressed. */
export const BUNDLE_LIMITS = {
  /** The zip file itself. */
  bundle: 64 * 1024 * 1024,
  /** All files together, uncompressed. */
  total: 96 * 1024 * 1024,
  files: 128,
  [PACK_FILE]: 2 * 1024 * 1024,
  model: 24 * 1024 * 1024,
  texture: 8 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
} as const

export interface Bundle {
  /** The validated (and migrated) pack. */
  pack: Pack
  /** The pack's JSON as stored in the bundle, for building a registry with other packs. */
  json: unknown
  /** Each asset's file contents, by asset id. */
  files: Map<string, Uint8Array>
}

const err = (path: string, message: string, pack?: string): ContentError => ({ ...(pack ? { pack } : {}), path, message })
const fail = (errors: ContentError[]): Result<never> => ({ ok: false, errors })

/** Hex SHA-256 of some bytes. */
export const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0

/**
 * Why some bytes aren't a usable binary glTF 2.0 model, or null when they are:
 * the header and chunk lengths must agree with the file, the JSON chunk must
 * parse as glTF 2.0, and every buffer and image must be inside the file (an
 * external or remote URI would have the game fetch from elsewhere).
 */
export const glbProblem = (b: Uint8Array): string | null => {
  if (b.length < 20 || u32(b, 0) !== 0x46546c67) return "isn't a binary glTF (.glb)"
  if (u32(b, 4) !== 2) return `is glTF version ${u32(b, 4)}; only glTF 2 is supported`
  if (u32(b, 8) !== b.length) return 'is cut short or has extra bytes (its header length is wrong)'
  const jsonLength = u32(b, 12)
  if (u32(b, 16) !== 0x4e4f534a || 20 + jsonLength > b.length) return "doesn't start with a glTF JSON chunk"
  let gltf: { asset?: { version?: unknown }; buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] }
  try {
    gltf = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jsonLength))) as typeof gltf
  } catch {
    return 'has a glTF JSON chunk that is not valid JSON'
  }
  if (typeof gltf !== 'object' || gltf === null || !String(gltf.asset?.version ?? '').startsWith('2.')) return "isn't glTF 2.0"
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].find((x) => typeof x?.uri === 'string' && !x.uri.startsWith('data:'))
  if (external) return `refers to an outside file ("${String(external.uri).slice(0, 60)}"); embed everything in the .glb`
  return null
}

/** The audio formats a bundle may carry, from their first bytes. */
export const audioType = (b: Uint8Array): 'mp3' | 'ogg' | 'wav' | null => {
  const ascii = (at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0))
  if (ascii(0, 'OggS')) return 'ogg'
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav'
  if (ascii(0, 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3'
  return null
}

// Inside a zip, paths are relative with forward slashes and no `..`.
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_\-./ ]+$/

/**
 * Model URLs in a shared pack may only point at the game's own files (a
 * same-origin path like `/models/robot-expressive.glb`); anything else must
 * ship in the bundle as an asset, so loading a pack never contacts a third party.
 */
export const isLocalUrl = (url: string): boolean => /^\/(?!\/)/.test(url) && !url.includes('\\')

const modelUrlErrors = (pack: Pack): ContentError[] => {
  const errors: ContentError[] = []
  const check = (model: { kind: string; url?: string }, path: string) => {
    if (model.kind === 'gltf' && model.url !== undefined && !isLocalUrl(model.url))
      errors.push(err(`${path}.url`, `"${model.url}" isn't a path on this site; put the model in the bundle as an asset`, pack.id))
  }
  if (pack.settings.player) check(pack.settings.player.model, 'settings.player.model')
  for (const [id, t] of Object.entries(pack.enemyTypes)) check(t.model, `enemyTypes.${id}.model`)
  return errors
}

/** Read and check a bundle: structure, sizes, the pack's schema, and each asset's size, hash and format. */
export const readBundle = async (zip: Uint8Array): Promise<Result<Bundle>> => {
  if (zip.length > BUNDLE_LIMITS.bundle)
    return fail([err('(bundle)', `the file is ${zip.length} bytes; the limit is ${BUNDLE_LIMITS.bundle}`)])

  let files: Unzipped
  const sizeErrors: ContentError[] = []
  let count = 0
  let total = 0
  try {
    files = unzipSync(zip, {
      // Runs before each file is decompressed, so an oversized file is never inflated.
      filter: (f) => {
        if (f.name.endsWith('/')) return false
        count++
        total += f.originalSize
        const limit = f.name === PACK_FILE ? BUNDLE_LIMITS[PACK_FILE] : BUNDLE_LIMITS.model
        if (f.originalSize > limit) {
          sizeErrors.push(err(f.name, `${f.originalSize} bytes is over the ${limit}-byte limit`))
          return false
        }
        return count <= BUNDLE_LIMITS.files && total <= BUNDLE_LIMITS.total
      },
    })
  } catch {
    return fail([err('(bundle)', 'not a valid zip file')])
  }
  if (count > BUNDLE_LIMITS.files) return fail([err('(bundle)', `${count} files; the limit is ${BUNDLE_LIMITS.files}`)])
  if (total > BUNDLE_LIMITS.total) return fail([err('(bundle)', `${total} bytes uncompressed; the limit is ${BUNDLE_LIMITS.total}`)])
  if (sizeErrors.length) return fail(sizeErrors)

  const packBytes = files[PACK_FILE]
  if (!packBytes) return fail([err('(bundle)', `no ${PACK_FILE} at the top of the zip`)])
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(packBytes))
  } catch (e) {
    return fail([err(PACK_FILE, `isn't valid JSON (${e instanceof Error ? e.message : String(e)})`)])
  }
  const parsed = parsePack(json)
  if (!parsed.ok) return parsed
  const pack = parsed.value

  const errors: ContentError[] = modelUrlErrors(pack)
  const assetFiles = new Map<string, Uint8Array>()
  for (const [i, asset] of pack.assets.entries()) {
    const path = `assets[${i}]`
    const problems = await assetErrors(asset, files[asset.path])
    errors.push(...problems.map((m) => err(path, m, pack.id)))
    if (!problems.length) assetFiles.set(asset.id, files[asset.path])
  }
  if (errors.length) return fail(errors)
  return { ok: true, value: { pack, json, files: assetFiles } }
}

/** The image format of a file from its first bytes: PNG, JPEG or WebP, or null for anything else. */
export const imageType = (b: Uint8Array): 'png' | 'jpeg' | 'webp' | null => {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

const assetErrors = async (asset: AssetDef, bytes: Uint8Array | undefined): Promise<string[]> => {
  if (!SAFE_PATH.test(asset.path)) return [`path "${asset.path}" must be relative, without ".."`]
  if (!bytes) return [`file "${asset.path}" is missing from the bundle`]
  const problems: string[] = []
  const limit = BUNDLE_LIMITS[asset.kind]
  if (bytes.length > limit) problems.push(`"${asset.path}" is ${bytes.length} bytes; the ${asset.kind} limit is ${limit}`)
  if (asset.bytes === undefined || asset.hash === undefined) problems.push('a bundled asset needs "bytes" and "hash"')
  else {
    if (bytes.length !== asset.bytes) problems.push(`"${asset.path}" is ${bytes.length} bytes, but the pack says ${asset.bytes}`)
    else if ((await sha256(bytes)) !== asset.hash) problems.push(`"${asset.path}" doesn't match its hash (corrupted or changed)`)
  }
  const glb = asset.kind === 'model' ? glbProblem(bytes) : null
  if (glb) problems.push(`"${asset.path}" ${glb}`)
  if (asset.kind === 'audio' && !audioType(bytes)) problems.push(`"${asset.path}" isn't an MP3, Ogg or WAV file`)
  if (asset.kind === 'texture' && !imageType(bytes)) problems.push(`"${asset.path}" isn't a PNG, JPEG or WebP image`)
  return problems
}

/**
 * Write a bundle: the pack JSON (with each asset's `bytes` and `hash` filled
 * in from its file) plus the asset files. `files` maps asset paths to contents.
 * Extra files (e.g. a LICENSE.txt) can go in `extras`.
 */
export const writeBundle = async (
  pack: Record<string, unknown>,
  files: Map<string, Uint8Array> = new Map(),
  extras: Record<string, Uint8Array> = {}
): Promise<Uint8Array> => {
  const assets = (Array.isArray(pack.assets) ? pack.assets : []) as AssetDef[]
  const withHashes = await Promise.all(
    assets.map(async (a) => {
      const bytes = files.get(a.path)
      if (!bytes) throw new Error(`no file for asset "${a.id}" (${a.path})`)
      return { ...a, bytes: bytes.length, hash: await sha256(bytes) }
    })
  )
  const json = JSON.stringify({ ...pack, assets: withHashes }, null, 2)
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {
    ...extras,
    [PACK_FILE]: new TextEncoder().encode(json),
  }
  // Models are already compact binary; store them without recompressing.
  for (const a of withHashes) entries[a.path] = [files.get(a.path)!, { level: a.kind === 'texture' ? 0 : 6 }]
  return zipSync(entries)
}
