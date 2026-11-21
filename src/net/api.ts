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

/** The next patch version: "1.2.3" → "1.2.4". */
export const nextVersion = (v: string): string => {
  const [a, b, c] = v.split('.').map((n) => Number(n) || 0)
  return `${a}.${b}.${c + 1}`
}
