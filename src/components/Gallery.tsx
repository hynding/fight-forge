import { useEffect, useState, type CSSProperties } from 'react'
import { getLevels } from '../content/active'
import { describeErrors, installBundle } from '../content/library'
import { readBundle } from '../content/bundle'
import {
  coverUrl,
  currentUser,
  fetchBundle,
  linkedPack,
  listPacks,
  packDetail,
  reportPack,
  setLike,
  setPackHidden,
  shareLink,
  type GallerySort,
  type PackDetail,
  type PublishedPack,
} from '../net/api'
import { Moderation } from './Moderation'
import { isUpdated, loadPlayed, recordPlayed } from '../net/played'
import { remixBundle } from '../forge/workspace'
import { forgeFocus, workspaceStore } from '../forge/storage'
import { useGameStore } from '../store/gameStore'

const PAGE = 24

const button: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#dddddd',
  border: '1px solid #555555',
  borderRadius: '4px',
  padding: '6px 12px',
  fontFamily: 'monospace',
  fontSize: '13px',
  cursor: 'pointer',
}
const input: CSSProperties = { ...button, cursor: 'text', background: '#10141f' }

/** A `?pack=` link is opened once, when the gallery first shows. */
let pendingLink: string | null = linkedPack()

/**
 * The pack gallery: published packs with search, sorting and creator pages;
 * a pack's page with its versions, Play (downloaded once, then cached) and a
 * share link. `?pack=<id>` links open straight to a pack's page.
 */
export const Gallery = () => {
  const setGameScreen = useGameStore((s) => s.setGameScreen)
  const startRun = useGameStore((s) => s.startRun)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<GallerySort>('new')
  const [played, setPlayed] = useState(loadPlayed)
  const [isAdmin, setIsAdmin] = useState(false)
  const [moderating, setModerating] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    currentUser()
      .then((u) => setIsAdmin(u?.role === 'admin'))
      .catch(() => undefined)
  }, [])
  const [owner, setOwner] = useState<string | null>(null)
  const [packs, setPacks] = useState<PublishedPack[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(() => pendingLink)
  // Cleared in an effect, not the initializer, which React may call twice.
  useEffect(() => {
    pendingLink = null
  }, [])

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let live = true
    setPacks(null)
    listPacks({ q: query, owner: owner ?? undefined, sort })
      .then((list) => {
        if (!live) return
        setPacks(list)
        setMore(list.length === PAGE)
        setError(null)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [query, owner, sort, reloads])

  const loadMore = async () => {
    const next = await listPacks({ q: query, owner: owner ?? undefined, sort, offset: packs?.length ?? 0 })
    setPacks((p) => [...(p ?? []), ...next])
    setMore(next.length === PAGE)
  }

  const play = async (id: string, version: string) => {
    const zip = await fetchBundle(id, version)
    const r = await installBundle(zip)
    if (!r.ok) throw new Error(describeErrors(r.errors))
    // Start at the pack's own first level if it has one.
    const read = await readBundle(zip)
    const own = read.ok ? read.value.pack.levels.map((l) => l.id) : []
    const at = getLevels().findIndex((l) => own.includes(l.id))
    setPlayed(recordPlayed(id, version))
    startRun(Math.max(0, at))
  }

  /** Copy a published pack into the Forge as the reader's own, crediting the original. */
  const remix = async (p: PublishedPack, version: string) => {
    const zip = await fetchBundle(p.id, version)
    const store = workspaceStore()
    const taken = (await store.list()).map((w) => w.id)
    const r = await remixBundle(zip, { id: p.id, version, name: p.name, owner: p.owner }, taken)
    if (!r.ok) throw new Error(describeErrors(r.errors))
    await store.put(r.value)
    forgeFocus.packId = r.value.id
    forgeFocus.nodeKey = 'pack'
    setGameScreen('forge')
  }

  const back = () => {
    // Leaving drops the `?pack=` from the address, so a reload doesn't reopen it.
    if (linkedPack()) window.history.replaceState(null, '', window.location.pathname)
    setGameScreen('menu')
  }

  return (
    <div
      data-testid="gallery"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(135deg, #12131f 0%, #151c33 100%)',
        color: '#e8e8e8',
        fontFamily: 'monospace',
        fontSize: '13px',
        overflowY: 'auto',
        padding: '16px 20px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button style={button} onClick={back} data-menu-back>
          ← Menu
        </button>
        <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '6px', marginRight: '10px' }}>PACKS</div>
        <input aria-label="Search packs" placeholder="Search…" style={{ ...input, width: '240px' }} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sort" style={input} value={sort} onChange={(e) => setSort(e.target.value as GallerySort)}>
          <option value="new">Newest</option>
          <option value="likes">Most liked</option>
          <option value="name">By name</option>
        </select>
        {isAdmin && (
          <button style={{ ...button, borderColor: '#ff9a7a', color: '#ffb89a' }} onClick={() => setModerating(true)}>
            Reports
          </button>
        )}
        {owner && (
          <span style={{ border: '1px solid #ffd27a', color: '#ffd27a', borderRadius: '4px', padding: '4px 8px' }}>
            by {owner}{' '}
            <button style={{ ...button, padding: '0 6px' }} aria-label="Show everyone's packs" onClick={() => setOwner(null)}>
              ×
            </button>
          </span>
        )}
      </div>

      {error && <div style={{ color: '#ff7a7a' }}>{error}</div>}
      {!error && packs === null && <div style={{ color: '#889' }}>Loading…</div>}
      {packs?.length === 0 && <div style={{ color: '#889' }}>{query || owner ? 'No packs match.' : 'No packs published yet. Make one in the Forge!'}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
        {packs?.map((p) => (
          <button
            key={p.id}
            data-testid={`pack-card-${p.id}`}
            onClick={() => setOpenId(p.id)}
            style={{ ...button, padding: 0, textAlign: 'left', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <Cover pack={p} height={124} />
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px', flex: 1 }}>{p.name}</span>
                {isUpdated(played, p.id, p.version) && (
                  <span data-testid="updated-badge" title="A newer version than you played" style={{ color: '#12131f', background: '#ffd27a', borderRadius: '3px', padding: '0 4px', fontSize: '11px' }}>
                    UPDATED
                  </span>
                )}
              </div>
              <div style={{ color: '#889' }}>
                v{p.version} · by {p.owner} · ♥ {p.likes}
              </div>
              {p.description && (
                <div style={{ color: '#aab', marginTop: '4px', maxHeight: '3.6em', overflow: 'hidden' }}>{p.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
      {more && (
        <button style={{ ...button, marginTop: '14px' }} onClick={loadMore}>
          More…
        </button>
      )}

      {moderating && (
        <Moderation
          onClose={() => {
            setModerating(false)
            setReloads((n) => n + 1)
          }}
          onOpenPack={setOpenId}
        />
      )}
      {openId && (
        <PackPage
          isAdmin={isAdmin}
          onChanged={() => setReloads((n) => n + 1)}
          key={openId}
          id={openId}
          onOpen={setOpenId}
          onRemix={remix}
          onClose={() => setOpenId(null)}
          onOwner={(name) => {
            setOwner(name)
            setOpenId(null)
          }}
          onPlay={play}
        />
      )}
    </div>
  )
}

const Cover = ({ pack, height }: { pack: PublishedPack; height: number }) =>
  pack.cover ? (
    <img src={coverUrl(pack.id)} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block', background: '#0b0e18' }} />
  ) : (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2a1830, #182a40)',
        color: '#ffffff55',
        fontSize: '28px',
        letterSpacing: '4px',
      }}
    >
      {pack.name.slice(0, 2).toUpperCase()}
    </div>
  )

/** One pack's page, over the gallery. */
const PackPage = ({
  id,
  onClose,
  onOwner,
  onPlay,
  onOpen,
  onRemix,
  isAdmin,
  onChanged,
}: {
  id: string
  isAdmin: boolean
  /** A moderator changed the pack. */
  onChanged: () => void
  onOpen: (id: string) => void
  onRemix: (pack: PublishedPack, version: string) => Promise<void>
  onClose: () => void
  onOwner: (name: string) => void
  onPlay: (id: string, version: string) => Promise<void>
}) => {
  const [detail, setDetail] = useState<PackDetail | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let live = true
    packDetail(id)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null))
    return () => {
      live = false
    }
  }, [id])

  const p = detail?.pack
  const latest = detail?.versions[detail.versions.length - 1]

  const toggleLike = () => {
    if (!detail) return
    setLike(detail.pack.id, !detail.liked)
      .then((r) => {
        if (!r) return setNote('Sign in (in the Forge, under Publish online) to like packs.')
        setDetail({ ...detail, liked: r.liked, pack: { ...detail.pack, likes: r.likes } })
      })
      .catch((e: Error) => setError(e.message))
  }
  const sendReport = () =>
    reportPack(id, reason.trim())
      .then((r) => {
        setReporting(false)
        setNote(r === 'signin' ? 'Sign in (in the Forge, under Publish online) to report a pack.' : 'Thanks. The moderators will take a look.')
      })
      .catch((e: Error) => setError(e.message))
  const setHidden = (hidden: boolean) =>
    setPackHidden(id, hidden, '')
      .then(() => packDetail(id))
      .then((d) => {
        setDetail(d)
        onChanged()
      })
      .catch((e: Error) => setError(e.message))
  const run = (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    task().catch((e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        data-testid="pack-page"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#151a2a', border: '1px solid #3a4258', borderRadius: '8px', width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {detail === undefined && <div style={{ padding: '20px', color: '#889' }}>Loading…</div>}
        {detail === null && (
          <div style={{ padding: '20px' }}>
            <div style={{ color: '#ff7a7a', marginBottom: '10px' }}>This pack doesn't exist, or it isn't shared.</div>
            <button style={button} onClick={onClose}>
              Back to the gallery
            </button>
          </div>
        )}
        {p && latest && (
          <>
            <Cover pack={p} height={220} />
            <div style={{ padding: '16px 18px' }}>
              {p.hidden && (
                <div data-testid="taken-down" style={{ color: '#ff9a7a', border: '1px solid #ff9a7a55', borderRadius: '4px', padding: '6px 8px', marginBottom: '10px' }}>
                  Taken down by a moderator: only its owner and moderators can see it.
                </div>
              )}
              <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{p.name}</div>
              <div style={{ color: '#889', margin: '4px 0 10px' }}>
                v{p.version} · by{' '}
                <button style={{ ...button, padding: '0 6px', color: '#ffd27a', border: 'none' }} onClick={() => onOwner(p.owner)}>
                  {p.owner}
                </button>
                {p.author && p.author !== p.owner && ` · credited to ${p.author}`}
              </div>
              {detail.remixOf && (
                <div style={{ color: '#aab', marginBottom: '10px' }} data-testid="remix-of">
                  Remix of{' '}
                  <button style={{ ...button, padding: '0 6px', color: '#ffd27a', border: 'none' }} onClick={() => onOpen(detail.remixOf!.id)}>
                    {detail.remixOf.name}
                  </button>{' '}
                  by {detail.remixOf.owner}
                </div>
              )}
              {p.description && <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{p.description}</div>}
              <div style={{ color: '#889', marginBottom: '12px' }}>License: {latest.license}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  style={{ ...button, borderColor: '#ff4444', color: '#ff8080', fontSize: '15px' }}
                  disabled={busy}
                  onClick={() => run(() => onPlay(p.id, latest.version))}
                >
                  {busy ? 'Loading…' : '▶ Play'}
                </button>
                <button
                  style={{ ...button, ...(detail.liked && { borderColor: '#ff6b9a', color: '#ff9ab8' }) }}
                  aria-pressed={detail.liked}
                  onClick={toggleLike}
                >
                  {detail.liked ? '♥' : '♡'} {p.likes}
                </button>
                <button
                  style={button}
                  disabled={busy}
                  title="Copy this pack into the Forge to make your own version; it keeps credit to this one"
                  onClick={() => run(() => onRemix(p, latest.version))}
                >
                  Remix in Forge
                </button>
                <button
                  style={button}
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(shareLink(p.id))
                      .then(() => setCopied(true))
                      .catch(() => setError(shareLink(p.id)))
                  }
                >
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
                <button style={button} onClick={() => setReporting((r) => !r)}>
                  ⚑ Report
                </button>
                {isAdmin && (
                  <button style={{ ...button, borderColor: '#ff9a7a', color: '#ffb89a' }} onClick={() => setHidden(!p.hidden)}>
                    {p.hidden ? 'Put back' : 'Take down'}
                  </button>
                )}
                <button style={button} onClick={onClose}>
                  Close
                </button>
              </div>
              {reporting && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                  <textarea
                    aria-label="What's wrong with this pack?"
                    placeholder="What's wrong with this pack? (offensive, stolen art, broken…)"
                    rows={3}
                    maxLength={1000}
                    style={{ ...input, resize: 'vertical' }}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button style={{ ...button, alignSelf: 'flex-start' }} disabled={reason.trim().length < 3} onClick={sendReport}>
                    Send report
                  </button>
                </div>
              )}
              {error && <pre style={{ color: '#ff7a7a', whiteSpace: 'pre-wrap' }}>{error}</pre>}
              {note && <div style={{ color: '#ffd27a', marginTop: '8px' }}>{note}</div>}
              <div style={{ color: '#667', marginTop: '14px' }}>
                Versions:{' '}
                {[...detail.versions]
                  .reverse()
                  .map((v) => `v${v.version} (${new Date(v.created).toLocaleDateString()})`)
                  .join(', ')}
              </div>
              {detail.remixes.length > 0 && (
                <div style={{ color: '#889', marginTop: '8px' }} data-testid="remixes">
                  Remixes:{' '}
                  {detail.remixes.map((r) => (
                    <button key={r.id} style={{ ...button, padding: '0 6px', marginRight: '4px' }} onClick={() => onOpen(r.id)}>
                      {r.name} by {r.owner}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
