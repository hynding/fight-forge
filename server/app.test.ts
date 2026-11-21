import { describe, expect, it } from 'vitest'
import { buildApp, compareVersions, CSRF_HEADER, SESSION_COOKIE } from './app'
import { memoryBlobs } from './blobs'
import { openStore } from './db'
import { addImageAsset, setCover } from '../src/forge/assets'
import { addModelAsset } from '../src/forge/fighter'
import { tinyGlb } from '../src/test/glb'
import { editPack, exportBundle, newPack, remixBundle, type WorkspacePack } from '../src/forge/workspace'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

const setup = (over: Partial<Parameters<typeof buildApp>[2]> = {}) =>
  buildApp(openStore(), memoryBlobs(), {
    allowedOrigins: ['http://game.test'],
    devLogin: true,
    crossSite: false,
    sessionDays: 30,
    publishPerHour: 20,
    ...over,
  })

type App = ReturnType<typeof setup>

const signIn = async (app: App, name: string) => {
  const r = await app.inject({ method: 'POST', url: '/auth/dev', headers: { [CSRF_HEADER]: '1' }, payload: { name } })
  expect(r.statusCode).toBe(200)
  const c = r.cookies.find((x) => x.name === SESSION_COOKIE)!
  expect(c.httpOnly).toBe(true)
  return `${SESSION_COOKIE}=${c.value}`
}

const bundleOf = async (wp: WorkspacePack) => Buffer.from(await exportBundle(wp))

const publish = (app: App, cookie: string | undefined, zip: Buffer, visibility = 'public') =>
  app.inject({
    method: 'POST',
    url: `/packs?visibility=${visibility}`,
    headers: { 'content-type': 'application/zip', [CSRF_HEADER]: '1', ...(cookie ? { cookie } : {}) },
    payload: zip,
  })

const pack = (name: string, version = '1.0.0', description = ''): WorkspacePack => {
  const wp = newPack(name, [])
  return editPack(wp, { ...wp.json, version, meta: { ...(wp.json.meta as object), description, license: 'CC-BY-4.0' } })
}

describe('server', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0)
  })

  it('signs in, tells who you are, and signs out', async () => {
    const app = setup()
    expect((await app.inject({ url: '/me' })).statusCode).toBe(401)
    const cookie = await signIn(app, 'Steve')
    expect((await app.inject({ url: '/me', headers: { cookie } })).json()).toMatchObject({ user: { name: 'Steve' } })
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, [CSRF_HEADER]: '1' } })
    expect((await app.inject({ url: '/me', headers: { cookie } })).statusCode).toBe(401)
  })

  it('has no dev sign-in unless it is turned on', async () => {
    const app = setup({ devLogin: false })
    const r = await app.inject({ method: 'POST', url: '/auth/dev', headers: { [CSRF_HEADER]: '1' }, payload: { name: 'x' } })
    expect(r.statusCode).toBe(404)
  })

  it('refuses state changes without the CSRF header', async () => {
    const app = setup()
    const r = await app.inject({ method: 'POST', url: '/auth/dev', payload: { name: 'x' } })
    expect(r.statusCode).toBe(403)
  })

  it('publishes a pack, then newer versions only, and serves it back', async () => {
    const app = setup()
    const cookie = await signIn(app, 'maker')
    let wp = pack('Big Brawl', '1.0.0', 'Lots of fighting')
    const img = addImageAsset(wp, 'cover.png', PNG)
    if (!img.ok) throw new Error(img.message)
    wp = editPack(img.pack, setCover(img.pack.json, img.assetId))

    expect((await publish(app, undefined, await bundleOf(wp))).statusCode).toBe(401)
    // One zip, sent and compared: zipping again can differ (file times).
    const v1 = await bundleOf(wp)
    const first = await publish(app, cookie, v1)
    expect(first.statusCode).toBe(201)
    expect(first.json().pack).toMatchObject({ id: 'big-brawl', version: '1.0.0', owner: 'maker', cover: true })

    expect((await publish(app, cookie, await bundleOf(wp))).statusCode).toBe(409)
    const v2 = editPack(wp, { ...wp.json, version: '1.1.0' })
    expect((await publish(app, cookie, await bundleOf(v2))).statusCode).toBe(201)

    const detail = (await app.inject({ url: '/packs/big-brawl' })).json()
    expect(detail.versions.map((v: { version: string }) => v.version)).toEqual(['1.0.0', '1.1.0'])
    const zip = await app.inject({ url: '/packs/big-brawl/versions/1.0.0/bundle' })
    expect(zip.statusCode).toBe(200)
    expect(zip.headers['cache-control']).toContain('immutable')
    expect(zip.rawPayload.equals(v1)).toBe(true)
    const cover = await app.inject({ url: '/packs/big-brawl/cover' })
    expect(cover.headers['content-type']).toBe('image/png')

    expect((await app.inject({ url: '/packs?owner=MAKER' })).json().packs).toHaveLength(1)
    expect((await app.inject({ url: '/packs?owner=someone' })).json().packs).toHaveLength(0)
    const list = (await app.inject({ url: '/packs?q=fight' })).json()
    expect(list.packs.map((p: { id: string }) => p.id)).toEqual(['big-brawl'])
    expect((await app.inject({ url: '/packs?q=nothing' })).json().packs).toEqual([])
  })

  it("rejects invalid packs with the game's own errors", async () => {
    const app = setup()
    const cookie = await signIn(app, 'maker')
    const wp = pack('Broken')
    const bad = editPack(wp, { ...wp.json, levels: [{ id: 'x', name: 'X', theme: 'nope', segments: [{ length: 10, triggers: [] }] }] })
    const r = await publish(app, cookie, await bundleOf(bad))
    expect(r.statusCode).toBe(422)
    expect(r.json().errors.some((e: { message: string }) => /nope/.test(e.message))).toBe(true)
    expect((await publish(app, cookie, Buffer.from('not a zip'))).statusCode).toBe(422)
  })

  it("won't let someone else publish over your pack id", async () => {
    const app = setup()
    await publish(app, await signIn(app, 'first'), await bundleOf(pack('Mine')))
    const r = await publish(app, await signIn(app, 'second'), await bundleOf(pack('Mine', '2.0.0')))
    expect(r.statusCode).toBe(403)
  })

  it('keeps private packs to their owner, and unlisted ones out of the gallery', async () => {
    const app = setup()
    const owner = await signIn(app, 'owner')
    await publish(app, owner, await bundleOf(pack('Secret')), 'private')
    await publish(app, owner, await bundleOf(pack('Hidden Link')), 'unlisted')
    expect((await app.inject({ url: '/packs/secret' })).statusCode).toBe(404)
    expect((await app.inject({ url: '/packs/secret', headers: { cookie: owner } })).statusCode).toBe(200)
    expect((await app.inject({ url: '/packs/hidden-link' })).statusCode).toBe(200)
    expect((await app.inject({ url: '/packs' })).json().packs).toEqual([])
    const mine = (await app.inject({ url: '/me/packs', headers: { cookie: owner } })).json().packs
    expect(mine.map((p: { id: string }) => p.id).sort()).toEqual(['hidden-link', 'secret'])
    const other = await signIn(app, 'other')
    const patch = (cookie: string) =>
      app.inject({ method: 'PATCH', url: '/packs/hidden-link', headers: { cookie, [CSRF_HEADER]: '1' }, payload: { visibility: 'public' } })
    expect((await patch(other)).statusCode).toBe(403)
    expect((await patch(owner)).statusCode).toBe(200)
    expect((await app.inject({ url: '/packs' })).json().packs).toHaveLength(1)
  })

  it('limits publishes per hour', async () => {
    const app = setup({ publishPerHour: 1 })
    const cookie = await signIn(app, 'busy')
    expect((await publish(app, cookie, await bundleOf(pack('One')))).statusCode).toBe(201)
    expect((await publish(app, cookie, await bundleOf(pack('Two')))).statusCode).toBe(429)
  })

  it('signs in with GitHub and returns to the game', async () => {
    const fake = (async (url: string) =>
      new Response(JSON.stringify(String(url).includes('access_token') ? { access_token: 't' } : { id: 42, login: 'octo' }))) as typeof fetch
    const app = setup({ github: { clientId: 'cid', clientSecret: 'sec', callbackUrl: 'http://api.test/auth/github/callback' }, fetch: fake })
    expect((await app.inject({ url: '/auth/github?return=http://evil.test/' })).statusCode).toBe(400)
    const start = await app.inject({ url: '/auth/github?return=http://game.test/' })
    expect(start.statusCode).toBe(302)
    const state = new URL(start.headers.location as string).searchParams.get('state')
    const back = await app.inject({ url: `/auth/github/callback?code=c&state=${state}` })
    expect(back.statusCode).toBe(302)
    expect(back.headers.location).toBe('http://game.test/')
    const cookie = `${SESSION_COOKIE}=${back.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`
    expect((await app.inject({ url: '/me', headers: { cookie } })).json().user.name).toBe('octo')
    // A state is single-use.
    expect((await app.inject({ url: `/auth/github/callback?code=c&state=${state}` })).statusCode).toBe(400)
  })

  it('remixes keep credit and leave the original alone', async () => {
    const app = setup()
    const alice = await signIn(app, 'alice')
    await publish(app, alice, await bundleOf(pack('Base', '1.0.0', 'the original')))
    const zip = (await app.inject({ url: '/packs/base/versions/1.0.0/bundle' })).rawPayload
    const r = await remixBundle(new Uint8Array(zip), { id: 'base', version: '1.0.0', name: 'Base', owner: 'alice' }, [])
    if (!r.ok) throw new Error(r.errors[0].message)
    const bob = await signIn(app, 'bob')
    const res = await publish(app, bob, await bundleOf(r.value))
    expect(res.statusCode).toBe(201)
    expect(res.json().pack).toMatchObject({ id: 'base-remix', owner: 'bob', name: 'Base (remix)' })

    const remix = (await app.inject({ url: '/packs/base-remix' })).json()
    expect(remix.remixOf).toMatchObject({ id: 'base', owner: 'alice' })
    const original = (await app.inject({ url: '/packs/base' })).json()
    expect(original.pack).toMatchObject({ owner: 'alice', version: '1.0.0', description: 'the original' })
    expect(original.versions).toHaveLength(1)
    expect(original.remixes.map((p: { id: string }) => p.id)).toEqual(['base-remix'])
    expect(original.remixOf).toBeNull()
  })

  it('counts likes once per person and sorts by them', async () => {
    const app = setup()
    const owner = await signIn(app, 'owner')
    await publish(app, owner, await bundleOf(pack('Plain')))
    await publish(app, owner, await bundleOf(pack('Loved')))
    const like = (cookie: string | undefined, id: string, liked: unknown) =>
      app.inject({ method: 'POST', url: `/packs/${id}/like`, headers: { [CSRF_HEADER]: '1', ...(cookie ? { cookie } : {}) }, payload: { liked } })
    expect((await like(undefined, 'loved', true)).statusCode).toBe(401)
    expect((await like(owner, 'loved', 'yes')).statusCode).toBe(400)
    expect((await like(owner, 'nope', true)).statusCode).toBe(404)
    const fan = await signIn(app, 'fan')
    expect((await like(fan, 'loved', true)).json()).toEqual({ liked: true, likes: 1 })
    expect((await like(fan, 'loved', true)).json()).toEqual({ liked: true, likes: 1 })
    expect((await like(owner, 'loved', true)).json().likes).toBe(2)
    expect((await app.inject({ url: '/packs/loved', headers: { cookie: fan } })).json().liked).toBe(true)
    expect((await app.inject({ url: '/packs/plain', headers: { cookie: fan } })).json().liked).toBe(false)
    const byLikes = (await app.inject({ url: '/packs?sort=likes' })).json().packs.map((p: { id: string; likes: number }) => `${p.id}:${p.likes}`)
    expect(byLikes).toEqual(['loved:2', 'plain:0'])
    expect((await like(fan, 'loved', false)).json()).toEqual({ liked: false, likes: 1 })
  })

  describe('moderation', () => {
    const post = (app: App, cookie: string | undefined, url: string, payload: object = {}, method: 'POST' | 'DELETE' = 'POST') =>
      app.inject({ method, url, headers: { [CSRF_HEADER]: '1', ...(cookie ? { cookie } : {}) }, payload })
    const gallery = async (app: App) => (await app.inject({ url: '/packs' })).json().packs.map((p: { id: string }) => p.id)

    it('takes a reported pack down, keeps it for its owner, and logs who did it', async () => {
      const app = setup({ admins: ['dev:mod'] })
      const owner = await signIn(app, 'owner')
      await publish(app, owner, await bundleOf(pack('Rude')))
      const reader = await signIn(app, 'reader')
      expect((await post(app, undefined, '/packs/rude/report', { reason: 'offensive' })).statusCode).toBe(401)
      expect((await post(app, reader, '/packs/rude/report', { reason: '' })).statusCode).toBe(400)
      expect((await post(app, reader, '/packs/rude/report', { reason: 'offensive names' })).statusCode).toBe(201)
      // A second report from the same person while the first is open is not a second report.
      expect((await post(app, reader, '/packs/rude/report', { reason: 'still offensive' })).statusCode).toBe(201)

      expect((await app.inject({ url: '/admin/reports', headers: { cookie: reader } })).statusCode).toBe(403)
      const mod = await signIn(app, 'Mod')
      expect((await app.inject({ url: '/me', headers: { cookie: mod } })).json().user.role).toBe('admin')
      const open = (await app.inject({ url: '/admin/reports', headers: { cookie: mod } })).json().reports
      expect(open).toHaveLength(1)
      expect(open[0]).toMatchObject({ packId: 'rude', packName: 'Rude', packOwner: 'owner', reporter: 'reader', reason: 'offensive names' })

      expect((await post(app, mod, '/admin/packs/rude/hidden', { hidden: true, note: 'slurs in names' })).json().pack.hidden).toBe(true)
      expect(await gallery(app)).toEqual([])
      expect((await app.inject({ url: '/packs/rude', headers: { cookie: reader } })).statusCode).toBe(404)
      expect((await app.inject({ url: '/packs/rude/versions/1.0.0/bundle' })).statusCode).toBe(404)
      // The owner still sees it, marked as taken down, and a new version doesn't bring it back.
      expect((await app.inject({ url: '/me/packs', headers: { cookie: owner } })).json().packs[0]).toMatchObject({ id: 'rude', hidden: true })
      expect((await publish(app, owner, await bundleOf(pack('Rude', '1.0.1')))).statusCode).toBe(201)
      expect(await gallery(app)).toEqual([])
      expect((await app.inject({ url: '/admin/reports', headers: { cookie: mod } })).json().reports).toEqual([])

      const log = (await app.inject({ url: '/admin/actions', headers: { cookie: mod } })).json().actions
      expect(log[0]).toMatchObject({ actor: 'Mod', action: 'hide-pack', target: 'rude', note: 'slurs in names' })
    })

    it('dismisses reports, and lets owners remove their own packs', async () => {
      const app = setup({ admins: ['dev:mod'] })
      const owner = await signIn(app, 'owner')
      await publish(app, owner, await bundleOf(pack('Fine')))
      const reader = await signIn(app, 'reader')
      await post(app, reader, '/packs/fine/report', { reason: 'I lost' })
      const mod = await signIn(app, 'mod')
      const [report] = (await app.inject({ url: '/admin/reports', headers: { cookie: mod } })).json().reports
      expect((await post(app, mod, `/admin/reports/${report.id}/dismiss`, { note: 'not a problem' })).statusCode).toBe(200)
      expect(await gallery(app)).toEqual(['fine'])

      expect((await post(app, reader, '/packs/fine', {}, 'DELETE')).statusCode).toBe(403)
      expect((await post(app, owner, '/packs/fine', {}, 'DELETE')).statusCode).toBe(200)
      expect(await gallery(app)).toEqual([])
      expect((await app.inject({ url: '/packs/fine', headers: { cookie: owner } })).statusCode).toBe(404)
      // The id is free again for its owner.
      expect((await publish(app, owner, await bundleOf(pack('Fine')))).statusCode).toBe(201)
    })

    it('bans an owner: sessions end, packs vanish, sign-in is refused', async () => {
      const app = setup({ admins: ['dev:mod'] })
      const spammer = await signIn(app, 'spammer')
      await publish(app, spammer, await bundleOf(pack('Spam')))
      const mod = await signIn(app, 'mod')
      expect((await post(app, mod, '/admin/packs/spam/owner-banned', { banned: true, note: 'spam' })).statusCode).toBe(200)
      expect((await app.inject({ url: '/me', headers: { cookie: spammer } })).statusCode).toBe(401)
      expect(await gallery(app)).toEqual([])
      expect((await post(app, undefined, '/auth/dev', { name: 'spammer' })).statusCode).toBe(403)
      expect((await post(app, mod, '/admin/packs/spam/owner-banned', { banned: false })).statusCode).toBe(200)
      expect(await gallery(app)).toEqual(['spam'])
    })

    it('limits reports per person and writes per address', async () => {
      const app = setup({ reportsPerHour: 2, writesPerIpPerHour: 8 })
      const owner = await signIn(app, 'owner')
      for (const n of ['A', 'B', 'C']) await publish(app, owner, await bundleOf(pack(n)))
      const reader = await signIn(app, 'reader')
      expect((await post(app, reader, '/packs/a/report', { reason: 'bad one' })).statusCode).toBe(201)
      expect((await post(app, reader, '/packs/b/report', { reason: 'bad two' })).statusCode).toBe(201)
      expect((await post(app, reader, '/packs/c/report', { reason: 'bad three' })).statusCode).toBe(429)
      // 2 sign-ins + 3 publishes + 3 reports so far: this address is out of writes.
      expect((await post(app, reader, '/packs/a/like', { liked: true })).statusCode).toBe(429)
      expect((await app.inject({ url: '/packs' })).statusCode).toBe(200)
    })

    it('refuses a model that would load files from elsewhere', async () => {
      const app = setup()
      const cookie = await signIn(app, 'maker')
      const m = addModelAsset(pack('Sneaky'), 'hero.glb', tinyGlb())
      if (!m.ok) throw new Error(m.message)
      const wp = { ...m.pack, files: { ...m.pack.files, 'models/hero.glb': tinyGlb({ images: [{ uri: 'https://tracker.example/p.png' }] }) } }
      const r = await publish(app, cookie, await bundleOf(wp))
      expect(r.statusCode).toBe(422)
      expect(r.json().errors[0].message).toMatch(/refers to an outside file/)
    })
  })
})
