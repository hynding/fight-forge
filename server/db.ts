// The server's data: users, sessions, packs and their versions, in SQLite
// (node:sqlite, one file). Kept behind this small `Store` so it can move to
// Postgres later without touching the routes (see docs/adr/0001).

import { createRequire } from 'node:module'

// Loaded at run time: Vite (used by the tests) doesn't know node:sqlite yet and would try to bundle it.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export type Visibility = 'public' | 'unlisted' | 'private'
export const VISIBILITIES: readonly Visibility[] = ['public', 'unlisted', 'private']

export interface User {
  id: string
  name: string
  role: 'user' | 'admin'
  banned: boolean
}

export interface PackRow {
  id: string
  ownerId: string
  ownerName: string
  name: string
  author: string
  description: string
  visibility: Visibility
  latestVersion: string
  hasCover: boolean
  /** The pack this one remixes, if any (its id; it may since have gone). */
  remixOf: string | null
  likes: number
  /** Taken down by a moderator, or its owner is banned: only the owner and admins see it. */
  hidden: boolean
  created: number
  updated: number
}

export interface ReportRow {
  id: number
  packId: string
  packName: string | null
  packOwner: string | null
  packHidden: boolean
  reporter: string
  reason: string
  created: number
}

export interface ActionRow {
  id: number
  actor: string
  action: string
  target: string
  note: string
  created: number
}

export interface VersionRow {
  packId: string
  version: string
  hash: string
  bytes: number
  license: string
  coverHash: string | null
  created: number
}

const SCHEMA = `
create table if not exists users (
  id text primary key,
  name text not null,
  provider text not null,
  provider_id text not null,
  role text not null default 'user',
  banned integer not null default 0,
  created integer not null,
  unique (provider, provider_id)
);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id),
  expires integer not null
);
create table if not exists packs (
  id text primary key,
  owner_id text not null references users(id),
  name text not null,
  author text not null,
  description text not null,
  visibility text not null,
  latest_version text not null,
  cover_hash text,
  hidden integer not null default 0,
  created integer not null,
  updated integer not null
);
create table if not exists pack_versions (
  pack_id text not null references packs(id),
  version text not null,
  hash text not null,
  bytes integer not null,
  license text not null,
  cover_hash text,
  created integer not null,
  primary key (pack_id, version)
);
create table if not exists likes (
  user_id text not null references users(id),
  pack_id text not null references packs(id),
  created integer not null,
  primary key (user_id, pack_id)
);
create index if not exists likes_pack on likes(pack_id);
create table if not exists reports (
  id integer primary key autoincrement,
  pack_id text not null,
  reporter_id text not null references users(id),
  reason text not null,
  created integer not null,
  resolved integer,
  resolution text
);
create index if not exists reports_open on reports(resolved, pack_id);
create table if not exists moderation_actions (
  id integer primary key autoincrement,
  actor_id text not null references users(id),
  action text not null,
  target text not null,
  note text not null,
  created integer not null
);
create virtual table if not exists packs_fts using fts5(id unindexed, name, description, author);
`

type Row = Record<string, unknown>

const toPack = (r: Row): PackRow => ({
  id: String(r.id),
  ownerId: String(r.owner_id),
  ownerName: String(r.owner_name),
  name: String(r.name),
  author: String(r.author),
  description: String(r.description),
  visibility: r.visibility as Visibility,
  latestVersion: String(r.latest_version),
  hasCover: r.cover_hash !== null,
  remixOf: r.remix_of == null ? null : String(r.remix_of),
  likes: Number(r.likes ?? 0),
  hidden: Number(r.hidden) === 1 || Number(r.owner_banned) === 1,
  created: Number(r.created),
  updated: Number(r.updated),
})

const toVersion = (r: Row): VersionRow => ({
  packId: String(r.pack_id),
  version: String(r.version),
  hash: String(r.hash),
  bytes: Number(r.bytes),
  license: String(r.license),
  coverHash: r.cover_hash === null ? null : String(r.cover_hash),
  created: Number(r.created),
})

const PACK_SELECT =
  'select p.*, u.name as owner_name, u.banned as owner_banned, (select count(*) from likes l where l.pack_id = p.id) as likes from packs p join users u on u.id = p.owner_id'

/** Columns added after the first release, for databases made before them. */
const COLUMNS: [table: string, column: string, type: string][] = [['packs', 'remix_of', 'text']]

/** Words for a full-text search, each as a prefix match; anything else is dropped. */
const ftsQuery = (q: string): string =>
  q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => `"${w}"*`)
    .join(' ')

export const openStore = (path = ':memory:') => {
  const db = new DatabaseSync(path)
  if (path !== ':memory:') db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')
  db.exec(SCHEMA)
  for (const [table, column, type] of COLUMNS) {
    const has = (db.prepare(`pragma table_info(${table})`).all() as Row[]).some((c) => c.name === column)
    if (!has) db.exec(`alter table ${table} add column ${column} ${type}`)
  }

  const user = (r: Row | undefined): User | null =>
    r ? { id: String(r.id), name: String(r.name), role: r.role === 'admin' ? 'admin' : 'user', banned: Number(r.banned) === 1 } : null

  return {
    /** Find or create the user for an identity provider account; the name follows the provider. */
    upsertUser(provider: string, providerId: string, name: string, now = Date.now()): User {
      const found = db.prepare('select * from users where provider = ? and provider_id = ?').get(provider, providerId) as Row | undefined
      if (found) {
        db.prepare('update users set name = ? where id = ?').run(name, String(found.id))
        return user({ ...found, name })!
      }
      const id = `${provider}-${providerId}`
      db.prepare('insert into users (id, name, provider, provider_id, created) values (?, ?, ?, ?, ?)').run(id, name, provider, providerId, now)
      return user(db.prepare('select * from users where id = ?').get(id) as Row)!
    },
    getUser: (id: string): User | null => user(db.prepare('select * from users where id = ?').get(id) as Row | undefined),
    setRole: (id: string, role: User['role']) => void db.prepare('update users set role = ? where id = ?').run(role, id),
    /** Ban or unban; a ban also ends every session of the user. */
    setBanned(id: string, banned: boolean) {
      db.prepare('update users set banned = ? where id = ?').run(banned ? 1 : 0, id)
      if (banned) db.prepare('delete from sessions where user_id = ?').run(id)
    },

    createSession(tokenHash: string, userId: string, expires: number) {
      db.prepare('insert into sessions (token_hash, user_id, expires) values (?, ?, ?)').run(tokenHash, userId, expires)
    },
    sessionUser(tokenHash: string, now = Date.now()): User | null {
      const r = db.prepare('select user_id, expires from sessions where token_hash = ?').get(tokenHash) as Row | undefined
      if (!r) return null
      if (Number(r.expires) <= now) {
        db.prepare('delete from sessions where token_hash = ?').run(tokenHash)
        return null
      }
      return this.getUser(String(r.user_id))
    },
    deleteSession: (tokenHash: string) => void db.prepare('delete from sessions where token_hash = ?').run(tokenHash),

    getPack: (id: string): (PackRow & { coverHash: string | null }) | null => {
      const r = db.prepare(`${PACK_SELECT} where p.id = ?`).get(id) as Row | undefined
      return r ? { ...toPack(r), coverHash: r.cover_hash === null ? null : String(r.cover_hash) } : null
    },
    versions: (packId: string): VersionRow[] =>
      (db.prepare('select * from pack_versions where pack_id = ? order by created').all(packId) as Row[]).map(toVersion),
    getVersion: (packId: string, version: string): VersionRow | null => {
      const r = db.prepare('select * from pack_versions where pack_id = ? and version = ?').get(packId, version) as Row | undefined
      return r ? toVersion(r) : null
    },

    /** Record a new version, creating the pack on its first one. */
    addVersion(
      p: { id: string; ownerId: string; name: string; author: string; description: string; visibility: Visibility; remixOf?: string | null },
      v: { version: string; hash: string; bytes: number; license: string; coverHash: string | null },
      now = Date.now()
    ) {
      db.exec('begin')
      try {
        const exists = db.prepare('select 1 from packs where id = ?').get(p.id)
        if (exists)
          db.prepare(
            'update packs set name = ?, author = ?, description = ?, visibility = ?, latest_version = ?, cover_hash = ?, remix_of = ?, updated = ? where id = ?'
          ).run(p.name, p.author, p.description, p.visibility, v.version, v.coverHash, p.remixOf ?? null, now, p.id)
        else
          db.prepare(
            'insert into packs (id, owner_id, name, author, description, visibility, latest_version, cover_hash, remix_of, created, updated) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(p.id, p.ownerId, p.name, p.author, p.description, p.visibility, v.version, v.coverHash, p.remixOf ?? null, now, now)
        db.prepare('insert into pack_versions (pack_id, version, hash, bytes, license, cover_hash, created) values (?, ?, ?, ?, ?, ?, ?)').run(
          p.id,
          v.version,
          v.hash,
          v.bytes,
          v.license,
          v.coverHash,
          now
        )
        db.prepare('delete from packs_fts where id = ?').run(p.id)
        db.prepare('insert into packs_fts (id, name, description, author) values (?, ?, ?, ?)').run(p.id, p.name, p.description, p.author)
        db.exec('commit')
      } catch (e) {
        db.exec('rollback')
        throw e
      }
    },

    setVisibility: (id: string, visibility: Visibility) =>
      void db.prepare('update packs set visibility = ?, updated = ? where id = ?').run(visibility, Date.now(), id),

    setHidden: (id: string, hidden: boolean) => void db.prepare('update packs set hidden = ? where id = ?').run(hidden ? 1 : 0, id),

    /** Remove a pack and its versions and likes (the bundle files stay, since others may share them). Reports keep the id. */
    deletePack(id: string) {
      db.exec('begin')
      try {
        for (const t of ['likes', 'pack_versions']) db.prepare(`delete from ${t} where pack_id = ?`).run(id)
        db.prepare('update packs set remix_of = null where remix_of = ?').run(id)
        db.prepare('delete from packs_fts where id = ?').run(id)
        db.prepare('delete from packs where id = ?').run(id)
        db.exec('commit')
      } catch (e) {
        db.exec('rollback')
        throw e
      }
    },

    /** A report, unless this person already has an open one on the pack; true when it was added. */
    addReport(packId: string, reporterId: string, reason: string, now = Date.now()): boolean {
      if (db.prepare('select 1 from reports where pack_id = ? and reporter_id = ? and resolved is null').get(packId, reporterId)) return false
      db.prepare('insert into reports (pack_id, reporter_id, reason, created) values (?, ?, ?, ?)').run(packId, reporterId, reason, now)
      return true
    },
    openReports: (): ReportRow[] =>
      (
        db
          .prepare(
            `select r.*, u.name as reporter, p.name as pack_name, o.name as pack_owner, p.hidden as pack_hidden
             from reports r join users u on u.id = r.reporter_id left join packs p on p.id = r.pack_id left join users o on o.id = p.owner_id
             where r.resolved is null order by r.created`
          )
          .all() as Row[]
      ).map((r) => ({
        id: Number(r.id),
        packId: String(r.pack_id),
        packName: r.pack_name == null ? null : String(r.pack_name),
        packOwner: r.pack_owner == null ? null : String(r.pack_owner),
        packHidden: Number(r.pack_hidden) === 1,
        reporter: String(r.reporter),
        reason: String(r.reason),
        created: Number(r.created),
      })),
    /** Close every open report on a pack. */
    resolveReports: (packId: string, resolution: string, now = Date.now()) =>
      void db.prepare('update reports set resolved = ?, resolution = ? where pack_id = ? and resolved is null').run(now, resolution, packId),
    reportPackId: (reportId: number): string | null => {
      const r = db.prepare('select pack_id from reports where id = ?').get(reportId) as Row | undefined
      return r ? String(r.pack_id) : null
    },

    /** The audit trail: every moderator action. */
    logAction: (actorId: string, action: string, target: string, note: string, now = Date.now()) =>
      void db.prepare('insert into moderation_actions (actor_id, action, target, note, created) values (?, ?, ?, ?, ?)').run(actorId, action, target, note, now),
    actions: (limit = 100): ActionRow[] =>
      (
        db
          .prepare('select a.*, u.name as actor from moderation_actions a join users u on u.id = a.actor_id order by a.id desc limit ?')
          .all(limit) as Row[]
      ).map((r) => ({ id: Number(r.id), actor: String(r.actor), action: String(r.action), target: String(r.target), note: String(r.note), created: Number(r.created) })),

    /** Like or unlike a pack (idempotent). */
    setLike(userId: string, packId: string, liked: boolean, now = Date.now()) {
      if (liked) db.prepare('insert or ignore into likes (user_id, pack_id, created) values (?, ?, ?)').run(userId, packId, now)
      else db.prepare('delete from likes where user_id = ? and pack_id = ?').run(userId, packId)
    },
    likes: (userId: string, packId: string): boolean => !!db.prepare('select 1 from likes where user_id = ? and pack_id = ?').get(userId, packId),
    /** Public, not hidden remixes of a pack, newest first. */
    remixesOf: (packId: string, limit = 24): PackRow[] =>
      (db.prepare(`${PACK_SELECT} where p.remix_of = ? and p.visibility = 'public' and p.hidden = 0 and u.banned = 0 order by p.updated desc limit ?`).all(packId, limit) as Row[]).map(toPack),

    /** Public, not hidden packs; newest first, by name or most liked; optionally matching words. */
    listPublic(opts: { q?: string; owner?: string; sort?: 'new' | 'name' | 'likes'; limit?: number; offset?: number } = {}): PackRow[] {
      const order = opts.sort === 'name' ? 'p.name collate nocase' : opts.sort === 'likes' ? 'likes desc, p.updated desc' : 'p.updated desc'
      const limit = Math.min(100, Math.max(1, opts.limit ?? 24))
      const offset = Math.max(0, opts.offset ?? 0)
      const q = opts.q ? ftsQuery(opts.q) : ''
      const where = ["p.visibility = 'public'", 'p.hidden = 0', 'u.banned = 0']
      const args: (string | number)[] = []
      if (q) {
        where.push('p.id in (select id from packs_fts where packs_fts match ?)')
        args.push(q)
      }
      if (opts.owner) {
        where.push('u.name = ? collate nocase')
        args.push(opts.owner)
      }
      const rows = db.prepare(`${PACK_SELECT} where ${where.join(' and ')} order by ${order} limit ? offset ?`).all(...args, limit, offset)
      return (rows as Row[]).map(toPack)
    },
    listByOwner: (ownerId: string): PackRow[] =>
      (db.prepare(`${PACK_SELECT} where p.owner_id = ? order by p.updated desc`).all(ownerId) as Row[]).map(toPack),

    close: () => db.close(),
  }
}

export type Store = ReturnType<typeof openStore>
