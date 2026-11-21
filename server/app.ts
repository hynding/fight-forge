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
  /** Reports allowed per user per hour. */
  reportsPerHour?: number
  /** State-changing requests allowed per IP address per hour (publishing, likes, reports, sign-ins). */
  writesPerIpPerHour?: number
  /** Moderators, as "provider:name" (e.g. "github:hynding"); they get the admin role when they sign in. */
  admins?: string[]
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

/** A sliding one-hour window of counts per key: `take` is false once `max` is reached. */
const hourlyLimit = (max: number) => {
  const hits = new Map<string, number[]>()
  return {
    take(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000)
      if (recent.length >= max) {
        hits.set(key, recent)
        return false
      }
      hits.set(key, [...recent, now])
      return true
    },
    /** How many are left without taking one. */
    left: (key: string, now = Date.now()) => max - (hits.get(key) ?? []).filter((t) => now - t < 3600_000).length,
  }
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
  likes: p.likes,
  hidden: p.hidden,
  updated: p.updated,
})

export const buildApp = (store: Store, blobs: Blobs, config: ServerConfig) => {
  const app = Fastify({ bodyLimit: BUNDLE_LIMITS.bundle, trustProxy: true })
  void app.register(cookie)
  void app.register(cors, { origin: config.allowedOrigins, credentials: true, allowedHeaders: ['content-type', CSRF_HEADER], methods: ['GET', 'POST', 'PATCH', 'DELETE'] })
  app.addContentTypeParser(['application/zip', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  const publishes = hourlyLimit(config.publishPerHour)
  const reports = hourlyLimit(config.reportsPerHour ?? 10)
  const ipWrites = hourlyLimit(config.writesPerIpPerHour ?? 600)
  const admins = new Set((config.admins ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean))
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
  /** Find or create the user, giving moderators listed in the settings their role. */
  const signInAs = (provider: string, providerId: string, name: string): User => {
    const user = store.upsertUser(provider, providerId, name)
    const role = admins.has(`${provider}:${name.toLowerCase()}`) ? 'admin' : 'user'
    if (user.role !== role) store.setRole(user.id, role)
    return { ...user, role }
  }
  /** Admins see everything; owners see their own packs (even taken down); others see what's shared and not taken down. */
  const canRead = (p: { visibility: Visibility; ownerId: string; hidden: boolean }, user: User | null) =>
    user?.role === 'admin' || user?.id === p.ownerId || (!p.hidden && p.visibility !== 'private')
  const isWrite = (method: string) => method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'

  app.addHook('onRequest', async (req, reply) => {
    if (isWrite(req.method) && !req.url.startsWith('/auth/github')) {
      if (req.headers[CSRF_HEADER] !== '1') return reply.code(403).send({ error: `missing ${CSRF_HEADER} header` })
      if (!ipWrites.take(req.ip)) return reply.code(429).send({ error: 'too many requests from this address; try again later' })
    }
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
    const user = signInAs('dev', name.toLowerCase(), name)
    if (user.banned) return reply.code(403).send({ error: 'this account is suspended' })
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
    const user = signInAs('github', String(gu.id), gu.login)
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
    if (publishes.left(user.id, now) <= 0) return reply.code(429).send({ error: 'too many publishes; try again in a while' })

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
      {
        id: pack.id,
        ownerId: user.id,
        name: pack.name,
        author: pack.meta.author,
        description: pack.meta.description,
        visibility,
        // Only a link to a pack that exists counts; the credit itself stays in the bundle either way.
        remixOf: pack.meta.remixOf && pack.meta.remixOf.id !== pack.id && store.getPack(pack.meta.remixOf.id) ? pack.meta.remixOf.id : null,
      },
      { version: pack.version, hash, bytes: zip.length, license: pack.meta.license, coverHash },
      now
    )
    publishes.take(user.id, now)
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

  app.delete('/packs/:id', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in first' })
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, user)) return reply.code(404).send({ error: 'no such pack' })
    if (p.ownerId !== user.id && user.role !== 'admin') return reply.code(403).send({ error: 'not your pack' })
    store.deletePack(p.id)
    store.resolveReports(p.id, 'deleted')
    if (p.ownerId !== user.id) store.logAction(user.id, 'delete-pack', p.id, String((req.body as { note?: unknown } | undefined)?.note ?? ''))
    return { ok: true }
  })

  // ---------------------------------------------------------------- reports and moderation

  app.post('/packs/:id/report', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in to report a pack' })
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, user)) return reply.code(404).send({ error: 'no such pack' })
    const reason = String((req.body as { reason?: unknown } | undefined)?.reason ?? '').trim()
    if (reason.length < 3 || reason.length > 1000) return reply.code(400).send({ error: 'say what is wrong, in 3 to 1000 characters' })
    if (reports.left(user.id) <= 0) return reply.code(429).send({ error: 'too many reports; try again later' })
    if (store.addReport(p.id, user.id, reason)) reports.take(user.id)
    return reply.code(201).send({ ok: true })
  })

  /** The signed-in admin, or a reply saying why not. */
  const admin = (req: FastifyRequest, reply: FastifyReply): User | null => {
    const user = currentUser(req)
    if (!user) void reply.code(401).send({ error: 'sign in first' })
    else if (user.role !== 'admin') void reply.code(403).send({ error: 'moderators only' })
    return user?.role === 'admin' ? user : null
  }
  const noteOf = (req: FastifyRequest) => String((req.body as { note?: unknown } | undefined)?.note ?? '').slice(0, 1000)

  app.get('/admin/reports', async (req, reply) => {
    if (!admin(req, reply)) return reply
    return { reports: store.openReports() }
  })

  app.get('/admin/actions', async (req, reply) => {
    if (!admin(req, reply)) return reply
    return { actions: store.actions() }
  })

  /** Take a pack down (or put it back); closes its open reports either way. */
  app.post('/admin/packs/:id/hidden', async (req, reply) => {
    const mod = admin(req, reply)
    if (!mod) return reply
    const p = store.getPack((req.params as { id: string }).id)
    if (!p) return reply.code(404).send({ error: 'no such pack' })
    const hidden = (req.body as { hidden?: unknown } | undefined)?.hidden
    if (typeof hidden !== 'boolean') return reply.code(400).send({ error: 'send { hidden: true | false, note }' })
    store.setHidden(p.id, hidden)
    store.resolveReports(p.id, hidden ? 'hidden' : 'kept')
    store.logAction(mod.id, hidden ? 'hide-pack' : 'unhide-pack', p.id, noteOf(req))
    return { pack: publicPack(store.getPack(p.id)!) }
  })

  /** Close a pack's open reports without acting on it. */
  app.post('/admin/reports/:id/dismiss', async (req, reply) => {
    const mod = admin(req, reply)
    if (!mod) return reply
    const packId = store.reportPackId(Number((req.params as { id: string }).id))
    if (!packId) return reply.code(404).send({ error: 'no such report' })
    store.resolveReports(packId, 'dismissed')
    store.logAction(mod.id, 'dismiss-reports', packId, noteOf(req))
    return { ok: true }
  })

  /** Ban (or unban) the owner of a pack: their sessions end and all their packs drop out of sight. */
  app.post('/admin/packs/:id/owner-banned', async (req, reply) => {
    const mod = admin(req, reply)
    if (!mod) return reply
    const p = store.getPack((req.params as { id: string }).id)
    if (!p) return reply.code(404).send({ error: 'no such pack' })
    const banned = (req.body as { banned?: unknown } | undefined)?.banned
    if (typeof banned !== 'boolean') return reply.code(400).send({ error: 'send { banned: true | false, note }' })
    if (p.ownerId === mod.id) return reply.code(400).send({ error: "you can't ban yourself" })
    store.setBanned(p.ownerId, banned)
    if (banned) store.resolveReports(p.id, 'owner banned')
    store.logAction(mod.id, banned ? 'ban-user' : 'unban-user', p.ownerId, noteOf(req))
    return { ok: true }
  })

  // ---------------------------------------------------------------- reading

  app.get('/packs', async (req) => {
    const q = req.query as { q?: string; owner?: string; sort?: string; limit?: string; offset?: string }
    const sort = q.sort === 'name' || q.sort === 'likes' ? q.sort : 'new'
    const packs = store.listPublic({ q: q.q, owner: q.owner, sort, limit: Number(q.limit) || undefined, offset: Number(q.offset) || 0 })
    return { packs: packs.map(publicPack) }
  })

  app.get('/me/packs', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in first' })
    return { packs: store.listByOwner(user.id).map(publicPack) }
  })

  app.get('/packs/:id', async (req, reply) => {
    const user = currentUser(req)
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, user)) return reply.code(404).send({ error: 'no such pack' })
    const original = p.remixOf ? store.getPack(p.remixOf) : null
    return {
      pack: publicPack(p),
      liked: user ? store.likes(user.id, p.id) : false,
      // The original, if it's still there for this reader to see.
      remixOf: original && canRead(original, user) ? publicPack(original) : null,
      remixes: store.remixesOf(p.id).map(publicPack),
      versions: store.versions(p.id).map((v) => ({ version: v.version, bytes: v.bytes, license: v.license, created: v.created })),
    }
  })

  app.post('/packs/:id/like', async (req, reply) => {
    const user = currentUser(req)
    if (!user) return reply.code(401).send({ error: 'sign in to like packs' })
    const p = store.getPack((req.params as { id: string }).id)
    if (!p || !canRead(p, user)) return reply.code(404).send({ error: 'no such pack' })
    const liked = (req.body as { liked?: unknown } | undefined)?.liked
    if (typeof liked !== 'boolean') return reply.code(400).send({ error: 'send { liked: true | false }' })
    store.setLike(user.id, p.id, liked)
    return { liked, likes: store.getPack(p.id)!.likes }
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
