import { describe, expect, it } from 'vitest'
import { buildApp, compareVersions, CSRF_HEADER, SESSION_COOKIE } from './app'
import { memoryBlobs } from './blobs'
import { openStore } from './db'
import { addImageAsset, setCover } from '../src/forge/assets'
import { editPack, exportBundle, newPack, type WorkspacePack } from '../src/forge/workspace'

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
    const first = await publish(app, cookie, await bundleOf(wp))
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
    expect(zip.rawPayload.equals(await bundleOf(wp))).toBe(true)
    const cover = await app.inject({ url: '/packs/big-brawl/cover' })
    expect(cover.headers['content-type']).toBe('image/png')

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
})
