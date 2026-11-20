import { useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import {
  defaultPackBundle,
  describeErrors,
  installBundle,
  installBundleFromUrl,
  packBundleBytes,
  removePack,
  setPackEnabled,
} from '../content/library'
import type { Result } from '../content/registry'

/** The sample remix pack shipped with the game (public/packs). */
const SAMPLE_PACK_URL = '/packs/skeleton-remix.zip'

const download = (bytes: Uint8Array, filename: string) => {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const small = {
  padding: '4px 8px',
  fontSize: '12px',
  fontFamily: 'monospace',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  color: '#dddddd',
  border: '1px solid #555555',
  borderRadius: '4px',
  cursor: 'pointer',
} as const

/**
 * Content packs on the start menu: import a pack bundle (file, URL, or the
 * shipped sample), turn packs on and off, export them, and download the
 * default pack as a starting point. Packs load on top of the built-in pack in
 * the order listed; problems are listed instead of starting a broken run.
 */
export const PackPanel = () => {
  const packs = useGameStore((s) => s.packs)
  const contentError = useGameStore((s) => s.contentError)
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const enabledCount = packs.filter((p) => p.enabled).length

  const run = async (load: () => Promise<Result<unknown>>) => {
    setBusy(true)
    setImportError(null)
    const r = await load()
    setBusy(false)
    if (!r.ok) setImportError(describeErrors(r.errors))
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    await run(async () => installBundle(new Uint8Array(await file.arrayBuffer())))
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div
      data-testid="pack-panel"
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: open ? '340px' : 'auto',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        padding: '14px',
        background: 'rgba(0, 0, 0, 0.45)',
        border: '1px solid #444444',
        borderRadius: '8px',
        fontSize: '13px',
        zIndex: 2,
        userSelect: 'text',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ ...small, border: 'none', background: 'none', fontSize: '14px', color: '#aaaaaa', letterSpacing: '3px', padding: 0 }}
      >
        {open ? '▾' : '▸'} CONTENT PACKS{enabledCount ? ` (${enabledCount} ON)` : ''}
      </button>
      {(open || contentError) && (
        <div style={{ marginTop: '10px' }}>

        <div style={{ marginBottom: '8px', color: '#aaaaaa' }}>
          <input type="checkbox" checked disabled /> Fight Forge (built in)
          <button style={{ ...small, marginLeft: '8px' }} onClick={async () => download(await defaultPackBundle(), 'fight-forge-default.zip')}>
            Download
          </button>
        </div>

        {packs.map((p) => (
          <div key={p.id} style={{ marginBottom: '8px' }}>
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => setPackEnabled(p.id, e.target.checked)} /> {p.name}{' '}
              <span style={{ color: '#888888' }}>
                v{p.version} by {p.author}
              </span>
            </label>
            {p.description && <div style={{ color: '#888888', margin: '2px 0 4px 22px' }}>{p.description}</div>}
            <div style={{ marginLeft: '22px', display: 'flex', gap: '6px' }}>
              <button style={small} onClick={() => download(packBundleBytes(p.id)!, `${p.id}.zip`)}>
                Export
              </button>
              <button style={small} onClick={() => removePack(p.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          <button style={small} disabled={busy} onClick={() => fileInput.current?.click()}>
            Import file…
          </button>
          <button style={small} disabled={busy} onClick={() => run(() => installBundleFromUrl(SAMPLE_PACK_URL))}>
            Add sample: Skeleton Remix
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        <form
          style={{ display: 'flex', gap: '6px', marginTop: '6px' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) run(() => installBundleFromUrl(url.trim()))
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Pack URL (.zip)"
            style={{ ...small, flex: 1, cursor: 'text' }}
          />
          <button style={small} disabled={busy || !url.trim()} type="submit">
            Load
          </button>
        </form>

        {busy && <div style={{ marginTop: '8px', color: '#aaaaaa' }}>Loading pack…</div>}
        {importError && (
          <pre data-testid="pack-error" style={{ whiteSpace: 'pre-wrap', color: '#ffbbbb', marginTop: '8px', fontSize: '12px' }}>
            Couldn't import the pack:{'\n'}
            {importError}
          </pre>
        )}
        {contentError && (
          <pre data-testid="content-error" style={{ whiteSpace: 'pre-wrap', color: '#ffbbbb', marginTop: '8px', fontSize: '12px' }}>
            These packs don't work together:{'\n'}
            {contentError}
          </pre>
        )}
        </div>
      )}
    </div>
  )
}
