import { useEffect, useState, type CSSProperties } from 'react'
import { getLevels } from '../content/active'
import { describeErrors, installBundle } from '../content/library'
import { readBundle } from '../content/bundle'
import { coverUrl, fetchBundle, linkedPack, listPacks, packDetail, shareLink, type PackDetail, type PublishedPack } from '../net/api'
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
  const [sort, setSort] = useState<'new' | 'name'>('new')
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
  }, [query, owner, sort])

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
    startRun(Math.max(0, at))
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
        <button style={button} onClick={back}>
          ← Menu
        </button>
        <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '6px', marginRight: '10px' }}>PACKS</div>
        <input aria-label="Search packs" placeholder="Search…" style={{ ...input, width: '240px' }} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sort" style={input} value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'name')}>
          <option value="new">Newest</option>
          <option value="name">By name</option>
        </select>
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
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{p.name}</div>
              <div style={{ color: '#889' }}>
                v{p.version} · by {p.owner}
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

      {openId && (
        <PackPage
          id={openId}
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
}: {
  id: string
  onClose: () => void
  onOwner: (name: string) => void
  onPlay: (id: string, version: string) => Promise<void>
}) => {
  const [detail, setDetail] = useState<PackDetail | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
              <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{p.name}</div>
              <div style={{ color: '#889', margin: '4px 0 10px' }}>
                v{p.version} · by{' '}
                <button style={{ ...button, padding: '0 6px', color: '#ffd27a', border: 'none' }} onClick={() => onOwner(p.owner)}>
                  {p.owner}
                </button>
                {p.author && p.author !== p.owner && ` · credited to ${p.author}`}
              </div>
              {p.description && <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{p.description}</div>}
              <div style={{ color: '#889', marginBottom: '12px' }}>License: {latest.license}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  style={{ ...button, borderColor: '#ff4444', color: '#ff8080', fontSize: '15px' }}
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    setError(null)
                    onPlay(p.id, latest.version).catch((e: Error) => {
                      setError(e.message)
                      setBusy(false)
                    })
                  }}
                >
                  {busy ? 'Loading…' : '▶ Play'}
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
                <button style={button} onClick={onClose}>
                  Close
                </button>
              </div>
              {error && <pre style={{ color: '#ff7a7a', whiteSpace: 'pre-wrap' }}>{error}</pre>}
              <div style={{ color: '#667', marginTop: '14px' }}>
                Versions:{' '}
                {[...detail.versions]
                  .reverse()
                  .map((v) => `v${v.version} (${new Date(v.created).toLocaleDateString()})`)
                  .join(', ')}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
