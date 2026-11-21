// The client for the Fight Forge API (server/, docs/adr/0001). The game works
// without it: with no VITE_API_URL, `apiEnabled()` is false and the online
// parts of the UI don't show.

import type { ContentError } from '../content/registry'

const base = (): string => (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')

export const apiEnabled = (): boolean => base() !== ''

export type Visibility = 'public' | 'unlisted' | 'private'

export interface ApiUser {
  id: string
  name: string
  role: 'user' | 'admin'
}

export interface PublishedPack {
  id: string
  name: string
  author: string
  description: string
  owner: string
  visibility: Visibility
  version: string
  cover: boolean
  likes: number
  /** Taken down by a moderator (only its owner and moderators see it). */
  hidden: boolean
  updated: number
}

export type PublishResult =
  | { ok: true; pack: PublishedPack }
  | { ok: false; message: string; errors?: ContentError[]; latest?: string }

const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const method = init.method ?? 'GET'
  return fetch(`${base()}${path}`, {
    ...init,
    credentials: 'include',
    // The server refuses state changes without this header (it forces a CORS preflight).
    headers: { ...(method !== 'GET' ? { 'x-fight-forge': '1' } : {}), ...(init.headers ?? {}) },
  })
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T

export const serverOptions = async (): Promise<{ devLogin: boolean; github: boolean }> => json(await call('/config'))

export const currentUser = async (): Promise<ApiUser | null> => {
  const res = await call('/me')
  return res.ok ? (await json<{ user: ApiUser }>(res)).user : null
}

export const devSignIn = async (name: string): Promise<ApiUser> => {
  const res = await call('/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  const body = await json<{ user?: ApiUser; error?: string }>(res)
  if (!res.ok || !body.user) throw new Error(body.error ?? `sign-in failed (${res.status})`)
  return body.user
}

/** Where to send the browser to sign in with GitHub; it comes back to `returnTo`. */
export const githubSignInUrl = (returnTo: string): string => `${base()}/auth/github?return=${encodeURIComponent(returnTo)}`

export const signOut = async (): Promise<void> => void (await call('/auth/logout', { method: 'POST' }))

export const myPacks = async (): Promise<PublishedPack[]> => {
  const res = await call('/me/packs')
  return res.ok ? (await json<{ packs: PublishedPack[] }>(res)).packs : []
}

/** Upload a bundle as a new version of its pack (creating the pack the first time). */
export const publishBundle = async (zip: Uint8Array, visibility: Visibility): Promise<PublishResult> => {
  let res: Response
  try {
    res = await call(`/packs?visibility=${visibility}`, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: zip as Uint8Array<ArrayBuffer>,
    })
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again." }
  }
  const body = await json<{ pack?: PublishedPack; error?: string; errors?: ContentError[]; latest?: string }>(res).catch(() => ({}) as Record<string, never>)
  if (res.ok && body.pack) return { ok: true, pack: body.pack }
  if (body.errors) return { ok: false, message: 'The server found problems with the pack:', errors: body.errors }
  return { ok: false, message: body.error ?? `Publishing failed (${res.status}).`, latest: body.latest }
}

export interface PackDetail {
  pack: PublishedPack
  versions: { version: string; bytes: number; license: string; created: number }[]
  /** Whether the signed-in reader likes it. */
  liked: boolean
  /** The pack this one remixes, while it's there to see. */
  remixOf: PublishedPack | null
  remixes: PublishedPack[]
}

export type GallerySort = 'new' | 'name' | 'likes'

/** Like or unlike a pack; null when not signed in. */
export const setLike = async (id: string, liked: boolean): Promise<{ liked: boolean; likes: number } | null> => {
  const res = await call(`/packs/${encodeURIComponent(id)}/like`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ liked }) })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`couldn't save the like (${res.status})`)
  return json(res)
}

/** The public gallery: newest first, by name or most liked, optionally matching words or by one creator. */
export const listPacks = async (opts: { q?: string; owner?: string; sort?: GallerySort; offset?: number } = {}): Promise<PublishedPack[]> => {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  if (opts.owner) params.set('owner', opts.owner)
  if (opts.sort) params.set('sort', opts.sort)
  if (opts.offset) params.set('offset', String(opts.offset))
  const res = await call(`/packs?${params}`)
  if (!res.ok) throw new Error(`the gallery couldn't load (${res.status})`)
  return (await json<{ packs: PublishedPack[] }>(res)).packs
}

export const packDetail = async (id: string): Promise<PackDetail | null> => {
  const res = await call(`/packs/${encodeURIComponent(id)}`)
  return res.ok ? json<PackDetail>(res) : null
}

export const coverUrl = (id: string): string => `${base()}/packs/${encodeURIComponent(id)}/cover`

const bundlePath = (id: string, version: string) => `/packs/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/bundle`

const CACHE = 'fight-forge-packs-v1'

/**
 * A published version's bundle. Versions never change, so a downloaded one is
 * kept in the browser's cache and later plays don't download it again.
 */
export const fetchBundle = async (id: string, version: string): Promise<Uint8Array> => {
  const url = `${base()}${bundlePath(id, version)}`
  const cache = typeof caches === 'undefined' ? null : await caches.open(CACHE).catch(() => null)
  const hit = await cache?.match(url)
  if (hit) return new Uint8Array(await hit.arrayBuffer())
  const res = await call(bundlePath(id, version))
  if (!res.ok) throw new Error(`couldn't download ${id} v${version} (${res.status})`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  // Private packs stay out of the shared cache.
  if (res.headers.get('cache-control')?.includes('public')) await cache?.put(url, new Response(bytes as Uint8Array<ArrayBuffer>)).catch(() => undefined)
  return bytes
}

/** A link that opens the game straight into a pack. */
export const shareLink = (id: string): string => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('pack', id)
  return url.toString()
}

/** The pack a link asked for (`?pack=<id>`), if any. */
export const linkedPack = (): string | null => {
  try {
    const id = new URLSearchParams(window.location.search).get('pack')
    return id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** The next patch version: "1.2.3" → "1.2.4". */
export const nextVersion = (v: string): string => {
  const [a, b, c] = v.split('.').map((n) => Number(n) || 0)
  return `${a}.${b}.${c + 1}`
}


/** A write that answers with ok or an error message; 'signin' when not signed in. */
const write = async (path: string, method: 'POST' | 'DELETE', body: object = {}): Promise<'ok' | 'signin'> => {
  const res = await call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status === 401) return 'signin'
  if (!res.ok) throw new Error((await json<{ error?: string }>(res).catch(() => ({}) as { error?: string })).error ?? `the server said ${res.status}`)
  return 'ok'
}
const packPath = (id: string) => `/packs/${encodeURIComponent(id)}`

/** Tell the moderators what's wrong with a pack. */
export const reportPack = (id: string, reason: string) => write(`${packPath(id)}/report`, 'POST', { reason })

/** Remove your own pack (all its versions) from the server. */
export const deletePack = (id: string) => write(packPath(id), 'DELETE')

// ---------------------------------------------------------------- moderators

export interface Report {
  id: number
  packId: string
  packName: string | null
  packOwner: string | null
  packHidden: boolean
  reporter: string
  reason: string
  created: number
}

export interface ModAction {
  id: number
  actor: string
  action: string
  target: string
  note: string
  created: number
}

export const openReports = async (): Promise<Report[]> => {
  const res = await call('/admin/reports')
  if (!res.ok) throw new Error(`couldn't load reports (${res.status})`)
  return (await json<{ reports: Report[] }>(res)).reports
}

export const modActions = async (): Promise<ModAction[]> => {
  const res = await call('/admin/actions')
  if (!res.ok) throw new Error(`couldn't load the log (${res.status})`)
  return (await json<{ actions: ModAction[] }>(res)).actions
}

export const setPackHidden = (id: string, hidden: boolean, note: string) => write(`/admin${packPath(id)}/hidden`, 'POST', { hidden, note })
export const dismissReports = (reportId: number, note: string) => write(`/admin/reports/${reportId}/dismiss`, 'POST', { note })
export const setOwnerBanned = (packId: string, banned: boolean, note: string) => write(`/admin${packPath(packId)}/owner-banned`, 'POST', { banned, note })
