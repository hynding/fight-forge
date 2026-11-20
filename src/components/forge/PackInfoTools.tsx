import { useEffect, useMemo, useRef } from 'react'
import { addImageAsset, assetUsage, imageMime, setCover } from '../../forge/assets'
import { assetsOf, removeAsset } from '../../forge/fighter'
import { editPack, type WorkspacePack } from '../../forge/workspace'
import { sectionHeading, ui } from './ui'

interface Props {
  pack: WorkspacePack
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
}

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

/** The pack page's tools: its cover image, and every file in the pack with where it's used. */
export const PackInfoTools = ({ pack, save, onError }: Props) => {
  const fileInput = useRef<HTMLInputElement>(null)
  const assets = assetsOf(pack.json)
  const usage = useMemo(() => assetUsage(pack.json), [pack.json])
  const coverId = (pack.json.meta as Record<string, unknown> | undefined)?.cover
  const coverAsset = assets.find((a) => a.id === coverId)
  const coverBytes = coverAsset ? pack.files[String(coverAsset.path)] : undefined
  const coverUrl = useMemo(
    () => (coverBytes ? URL.createObjectURL(new Blob([coverBytes as Uint8Array<ArrayBuffer>], { type: imageMime(coverBytes) })) : undefined),
    [coverBytes]
  )
  useEffect(() => () => {
    if (coverUrl) URL.revokeObjectURL(coverUrl)
  }, [coverUrl])

  const onCover = async (file: File | undefined) => {
    if (!file) return
    const r = addImageAsset(pack, file.name, new Uint8Array(await file.arrayBuffer()))
    if (fileInput.current) fileInput.current.value = ''
    if (!r.ok) return onError(r.message)
    // Replace the old cover's file if nothing else uses it.
    let next = r.pack
    if (typeof coverId === 'string' && (usage.get(coverId) ?? []).every((u) => u === 'meta.cover')) next = removeAsset(next, coverId)
    save(editPack(next, setCover(next.json, r.assetId)))
  }
  const clearCover = () => {
    let next = pack
    if (typeof coverId === 'string' && (usage.get(coverId) ?? []).every((u) => u === 'meta.cover')) next = removeAsset(next, coverId)
    save(editPack(next, setCover(next.json, undefined)))
  }

  return (
    <div data-testid="pack-info-tools">
      <div style={sectionHeading}>COVER IMAGE</div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '192px',
            height: '108px',
            border: '1px dashed #3a4258',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            color: '#667',
          }}
        >
          {coverUrl ? <img data-testid="cover-preview" src={coverUrl} alt="Cover" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : 'No cover'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <button style={ui.button} onClick={() => fileInput.current?.click()}>
            {coverUrl ? 'Change cover…' : 'Choose cover image…'}
          </button>
          {typeof coverId === 'string' && (
            <button style={ui.button} onClick={clearCover}>
              Remove cover
            </button>
          )}
          <span style={{ color: '#667', maxWidth: '260px' }}>A PNG, JPEG or WebP, shown with the pack in the menu. 16:9 looks best.</span>
        </div>
        <input
          ref={fileInput}
          data-testid="cover-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => onCover(e.target.files?.[0])}
        />
      </div>

      <div style={sectionHeading}>FILES IN THIS PACK</div>
      {assets.length === 0 ? (
        <div style={{ color: '#889' }}>None yet. Models imported in the fighter tools and the cover image are kept here.</div>
      ) : (
        <table data-testid="pack-assets" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {assets.map((a) => {
              const id = String(a.id)
              const bytes = pack.files[String(a.path)]
              const uses = usage.get(id) ?? []
              return (
                <tr key={id} style={{ borderTop: '1px solid #2c3346' }}>
                  <td style={{ padding: '3px 6px' }}>{id}</td>
                  <td style={{ padding: '3px 6px', color: '#889' }}>{String(a.kind)}</td>
                  <td style={{ padding: '3px 6px', color: '#889', textAlign: 'right' }}>{bytes ? size(bytes.length) : 'missing'}</td>
                  <td style={{ padding: '3px 6px', color: uses.length ? '#aab' : '#ffd27a' }}>{uses.length ? `used by ${uses.join(', ')}` : 'not used'}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                    <button
                      style={ui.button}
                      disabled={uses.length > 0}
                      title={uses.length ? 'Still in use; change what uses it first' : 'Take this file out of the pack'}
                      onClick={() => save(removeAsset(pack, id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
