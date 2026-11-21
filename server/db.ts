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
  created: number
  updated: number
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

const PACK_SELECT = 'select p.*, u.name as owner_name from packs p join users u on u.id = p.owner_id'

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

    getPack: (id: string): (PackRow & { hidden: boolean; coverHash: string | null }) | null => {
      const r = db.prepare(`${PACK_SELECT} where p.id = ?`).get(id) as Row | undefined
      return r ? { ...toPack(r), hidden: Number(r.hidden) === 1, coverHash: r.cover_hash === null ? null : String(r.cover_hash) } : null
    },
    versions: (packId: string): VersionRow[] =>
      (db.prepare('select * from pack_versions where pack_id = ? order by created').all(packId) as Row[]).map(toVersion),
    getVersion: (packId: string, version: string): VersionRow | null => {
      const r = db.prepare('select * from pack_versions where pack_id = ? and version = ?').get(packId, version) as Row | undefined
      return r ? toVersion(r) : null
    },

    /** Record a new version, creating the pack on its first one. */
    addVersion(
      p: { id: string; ownerId: string; name: string; author: string; description: string; visibility: Visibility },
      v: { version: string; hash: string; bytes: number; license: string; coverHash: string | null },
      now = Date.now()
    ) {
      db.exec('begin')
      try {
        const exists = db.prepare('select 1 from packs where id = ?').get(p.id)
        if (exists)
          db.prepare(
            'update packs set name = ?, author = ?, description = ?, visibility = ?, latest_version = ?, cover_hash = ?, updated = ? where id = ?'
          ).run(p.name, p.author, p.description, p.visibility, v.version, v.coverHash, now, p.id)
        else
          db.prepare(
            'insert into packs (id, owner_id, name, author, description, visibility, latest_version, cover_hash, created, updated) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(p.id, p.ownerId, p.name, p.author, p.description, p.visibility, v.version, v.coverHash, now, now)
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

    /** Public, not hidden packs; newest first, or by name; optionally matching words. */
    listPublic(opts: { q?: string; sort?: 'new' | 'name'; limit?: number; offset?: number } = {}): PackRow[] {
      const order = opts.sort === 'name' ? 'p.name collate nocase' : 'p.updated desc'
      const limit = Math.min(100, Math.max(1, opts.limit ?? 24))
      const offset = Math.max(0, opts.offset ?? 0)
      const q = opts.q ? ftsQuery(opts.q) : ''
      const rows = q
        ? db
            .prepare(
              `${PACK_SELECT} where p.visibility = 'public' and p.hidden = 0 and p.id in (select id from packs_fts where packs_fts match ?) order by ${order} limit ? offset ?`
            )
            .all(q, limit, offset)
        : db.prepare(`${PACK_SELECT} where p.visibility = 'public' and p.hidden = 0 order by ${order} limit ? offset ?`).all(limit, offset)
      return (rows as Row[]).map(toPack)
    },
    listByOwner: (ownerId: string): PackRow[] =>
      (db.prepare(`${PACK_SELECT} where p.owner_id = ? order by p.updated desc`).all(ownerId) as Row[]).map(toPack),

    close: () => db.close(),
  }
}

export type Store = ReturnType<typeof openStore>
