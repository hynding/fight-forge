// The Fight Forge API (docs/adr/0001): accounts, publishing packs with new
// versions, and reading them back. Uploaded bundles go through the same
// checks the game runs (`readBundle`, `buildRegistry` with the default pack).

import { createHash, randomBytes } from 'node:crypto'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { BUNDLE_LIMITS, imageType, readBundle } from '../src/content/bundle'
import { buildRegistry, type ContentError } from '../src/content/registry'
import { defaultPack } from '../src/content/defaultPack'
import type { Blobs } from './blobs'
import { VISIBILITIES, type PackRow, type Store, type User, type Visibility } from './db'

export interface ServerConfig {
  /** Origins of the game allowed to call the API with credentials (CORS). */
  allowedOrigins: string[]
  /** Allow `POST /auth/dev` (sign in by name, no password): local development and tests only. */
  devLogin: boolean
  github?: { clientId: string; clientSecret: string; callbackUrl: string }
  /** Session cookies: Secure and SameSite=None when the game and API are on different sites (production). */
  crossSite: boolean
  sessionDays: number
  /** Publishes allowed per user per hour. */
  publishPerHour: number
  /** For the GitHub sign-in calls; replaced in tests. */
  fetch?: typeof fetch
}

export const SESSION_COOKIE = 'ff_session'
/** Required on every state-changing request: a custom header forces a CORS preflight, so other sites can't post with the user's cookie. */
export const CSRF_HEADER = 'x-fight-forge'

const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex')

/** Compare "1.2.10" and "1.10.0" as versions. */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

const publicPack = (p: PackRow) => ({
  id: p.id,
  name: p.name,
  author: p.author,
  description: p.description,
  owner: p.ownerName,
  visibility: p.visibility,
  version: p.latestVersion,
  cover: p.hasCover,
  updated: p.updated,
})

export const buildApp = (store: Store, blobs: Blobs, config: ServerConfig) => {
  const app = Fastify({ bodyLimit: BUNDLE_LIMITS.bundle, trustProxy: true })
  void app.register(cookie)
  void app.register(cors, { origin: config.allowedOrigins, credentials: true, allowedHeaders: ['content-type', CSRF_HEADER], methods: ['GET', 'POST', 'PATCH'] })
  app.addContentTypeParser(['application/zip', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  const publishes = new Map<string, number[]>()
  const oauthStates = new Map<string, { returnTo: string; expires: number }>()

  const currentUser = (req: FastifyRequest): User | null => {
    const token = req.cookies[SESSION_COOKIE]
    if (!token) return null
    const u = store.sessionUser(sha256(token))
    return u && !u.banned ? u : null
  }
  const startSession = (reply: FastifyReply, user: User) => {
    const token = randomBytes(32).toString('base64url')
    const maxAge = config.sessionDays * 24 * 3600
    store.createSession(sha256(token), user.id, Date.now() + maxAge * 1000)
    void reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.crossSite,
      sameSite: config.crossSite ? 'none' : 'lax',
      path: '/',
      maxAge,
    })
  }
  const canRead = (p: { visibility: Visibility; ownerId: string; hidden: boolean }, user: User | null) =>
    user?.role === 'admin' || (!p.hidden && (p.visibility !== 'private' || user?.id === p.ownerId))

  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && !req.url.startsWith('/auth/github'))
      if (req.headers[CSRF_HEADER] !== '1') return reply.code(403).send({ error: `missing ${CSRF_HEADER} header` })
  })

  app.get('/health', async () => ({ ok: true }))
  app.get('/config', async () => ({ devLogin: config.devLogin, github: !!config.github }))

  // ---------------------------------------------------------------- accounts

  app.get('/me', async (req, reply) => {
    const user = currentUser(req)
    return user ? { user: { id: user.id, name: user.name, role: user.role } } : reply.code(401).send({ error: 'not signed in' })
  })

  app.post('/auth/dev', async (req, reply) => {
    if (!config.devLogin) return reply.code(404).send({ error: 'not found' })
    const name = String((req.body as { name?: unknown } | undefined)?.name ?? '').trim()
    if (!/^[\w .-]{1,40}$/.test(name)) return reply.code(400).send({ error: 'pick a name of 1 to 40 letters or digits' })
    const user = store.upsertUser('dev', name.toLowerCase(), name)
    startSession(reply, user)
    return { user: { id: user.id, name: user.name, role: user.role } }
  })

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) store.deleteSession(sha256(token))
    void reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  const allowedReturn = (url: string) => {
    try {
      return config.allowedOrigins.includes(new URL(url).origin)
    } catch {
      return false
    }
  }

  app.get('/auth/github', async (req, reply) => {
    const gh = config.github
    if (!gh) return reply.code(404).send({ error: 'GitHub sign-in is not set up' })
    const returnTo = String((req.query as { return?: string }).return ?? '')
    if (!allowedReturn(returnTo)) return reply.code(400).send({ error: 'bad return address' })
    const state = randomBytes(16).toString('base64url')
    oauthStates.set(state, { returnTo, expires: Date.now() + 10 * 60 * 1000 })
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', gh.clientId)
    url.searchParams.set('redirect_uri', gh.callbackUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('allow_signup', 'true')
    return reply.redirect(url.toString())
  })

  app.get('/auth/github/callback', async (req, reply) => {
    const gh = config.github
    if (!gh) return reply.code(404).send({ error: 'GitHub sign-in is not set up' })
    const { code, state } = req.query as { code?: string; state?: string }
    const pending = state ? oauthStates.get(state) : undefined
    if (state) oauthStates.delete(state)
    if (!code || !pending || pending.expires < Date.now()) return reply.code(400).send({ error: 'sign-in expired; try again' })
    const f = config.fetch ?? fetch
    const tokenRes = await f('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: gh.clientId, client_secret: gh.clientSecret, code, redirect_uri: gh.callbackUrl }),
    })
    const token = ((await tokenRes.json()) as { access_token?: string }).access_token
    if (!token) return reply.code(502).send({ error: 'GitHub refused the sign-in' })
    const userRes = await f('https://api.github.com/user', { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'fight-forge' } })
    const gu = (await userRes.json()) as { id?: number; login?: string }
    if (!gu.id || !gu.login) return reply.code(502).send({ error: 'GitHub sign-in failed' })
    const user = store.upsertUser('github', String(gu.id), gu.login)
    if (user.banned) return reply.code(403).send({ error: 'this account is suspended' })
    startSession(reply, user)
    return reply.redirect(pending.returnTo)
  })

  // ---------------------------------------------------------------- publishing

  app.post('/packs', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in to publish' })
    const visibility = String((req.query as { visibility?: string }).visibility ?? 'public') as Visibility
    if (!VISIBILITIES.includes(visibility)) return reply.code(400).send({ error: 'visibility must be public, unlisted or private' })
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'send the bundle as application/zip' })

    const now = Date.now()
    const recent = (publishes.get(user.id) ?? []).filter((t) => now - t < 3600_000)
    if (recent.length >= config.publishPerHour) return reply.code(429).send({ error: 'too many publishes; try again in a while' })

    const zip = new Uint8Array(req.body)
    const fail = (errors: ContentError[]) => reply.code(422).send({ errors })
    const read = await readBundle(zip)
    if (!read.ok) return fail(read.errors)
    const { pack } = read.value
    if (pack.id === 'default') return fail([{ path: 'id', message: 'the id "default" is the built-in pack\'s' }])
    const check = buildRegistry([defaultPack(), read.value.json])
    if (!check.ok) return fail(check.errors)
    if (!pack.meta.license.trim()) return fail([{ path: 'meta.license', message: 'declare a license for the pack and its files' }])

    const existing = store.getPack(pack.id)
    if (existing && existing.ownerId !== user.id) return reply.code(403).send({ error: `the pack id "${pack.id}" belongs to someone else; duplicate the pack to publish your own` })
    if (existing && compareVersions(pack.version, existing.latestVersion) <= 0)
      return reply.code(409).send({ error: `version ${pack.version} isn't newer than the published ${existing.latestVersion}`, latest: existing.latestVersion })

    const hash = sha256(zip)
    await blobs.put(hash, zip)
    let coverHash: string | null = null
    const cover = pack.meta.cover !== undefined ? read.value.files.get(pack.meta.cover) : undefined
    if (cover && imageType(cover)) {
      coverHash = sha256(cover)
      await blobs.put(coverHash, cover)
    }
    store.addVersion(
      { id: pack.id, ownerId: user.id, name: pack.name, author: pack.meta.author, description: pack.meta.description, visibility },
      { version: pack.version, hash, bytes: zip.length, license: pack.meta.license, coverHash },
      now
    )
    publishes.set(user.id, [...recent, now])
    return reply.code(201).send({ pack: publicPack(store.getPack(pack.id)!) })
  })

  app.patch('/packs/:id', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in first' })
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, user)) return reply.code(404).send({ error: 'no such pack' })
    if (p.ownerId !== user.id) return reply.code(403).send({ error: 'not your pack' })
    const visibility = (req.body as { visibility?: Visibility } | undefined)?.visibility
    if (!visibility || !VISIBILITIES.includes(visibility)) return reply.code(400).send({ error: 'visibility must be public, unlisted or private' })
    store.setVisibility(p.id, visibility)
    return { pack: publicPack(store.getPack(p.id)!) }
  })

  // ---------------------------------------------------------------- reading

  app.get('/packs', async (req) => {
    const q = req.query as { q?: string; owner?: string; sort?: string; limit?: string; offset?: string }
    const packs = store.listPublic({ q: q.q, owner: q.owner, sort: q.sort === 'name' ? 'name' : 'new', limit: Number(q.limit) || undefined, offset: Number(q.offset) || 0 })
    return { packs: packs.map(publicPack) }
  })

  app.get('/me/packs', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in first' })
    return { packs: store.listByOwner(user.id).map(publicPack) }
  })

  app.get('/packs/:id', async (req, reply) => {
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, currentUser(req))) return reply.code(404).send({ error: 'no such pack' })
    return {
      pack: publicPack(p),
      versions: store.versions(p.id).map((v) => ({ version: v.version, bytes: v.bytes, license: v.license, created: v.created })),
    }
  })

  app.get('/packs/:id/versions/:version/bundle', async (req, reply) => {
    const { id, version } = req.params as { id: string; version: string }
    const p = store.getPack(id)
    const v = p && canRead(p, currentUser(req)) ? store.getVersion(id, version) : null
    const bytes = v && (await blobs.get(v.hash))
    if (!bytes) return reply.code(404).send({ error: 'no such version' })
    // A version never changes once published.
    const cache = p!.visibility === 'private' ? 'private, max-age=3600' : 'public, max-age=31536000, immutable'
    return reply.header('cache-control', cache).header('content-disposition', `attachment; filename="${id}-${version}.zip"`).type('application/zip').send(Buffer.from(bytes))
  })

  app.get('/packs/:id/cover', async (req, reply) => {
    const p = store.getPack((req.params as { id: string }).id)
    const bytes = p && p.coverHash && canRead(p, currentUser(req)) ? await blobs.get(p.coverHash) : null
    if (!bytes) return reply.code(404).send({ error: 'no cover' })
    return reply.header('cache-control', 'public, max-age=300').type(`image/${imageType(bytes) ?? 'png'}`).send(Buffer.from(bytes))
  })

  return app
}
