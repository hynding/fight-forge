import { useEffect, useRef, useState } from 'react'
import { previewMusic, previewSound } from '../../audio/engine'
import type { MusicDef, SoundDef } from '../../audio/types'
import { siteUrl } from '../../content/siteUrl'
import { addAudioAsset, audioMime } from '../../forge/assets'
import { assetsOf } from '../../forge/fighter'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import { sectionHeading, ui } from './ui'

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
  onError: (text: string) => void
}

type FileDef = { kind: 'file'; url?: string; asset?: string; volume: number }

/** A playable URL for a file sound: the pack's own bytes as a blob, or a site path. */
const useFileUrl = (pack: WorkspacePack, def: FileDef | null): string | null => {
  const [url, setUrl] = useState<string | null>(null)
  const asset = def?.asset
  const path = asset ? String(assetsOf(pack.json).find((a) => a.id === asset)?.path ?? '') : ''
  const bytes = path ? pack.files[path] : undefined
  useEffect(() => {
    if (!def) return setUrl(null)
    if (def.url) return setUrl(siteUrl(def.url))
    if (!bytes) return setUrl(null)
    const u = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: audioMime(bytes) }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [def?.url, bytes]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

/**
 * Tools for a sound or a piece of music: hear it (▶), and use an audio file
 * of your own instead of the synth. The rest is edited in the form below.
 */
export const SoundTools = ({ pack, node, save, onError }: Props) => {
  const value = (nodeValue(pack.json, node) ?? {}) as { kind?: string } & Record<string, unknown>
  const isMusic = node.group === 'music'
  const file = value.kind === 'file' ? (value as unknown as FileDef) : null
  const url = useFileUrl(pack, file)
  const [playing, setPlaying] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Stop a music preview when leaving this item.
  useEffect(() => () => previewMusic(null), [node.key])

  const resolved = (): SoundDef | MusicDef | null => {
    if (!file) return value as unknown as SoundDef | MusicDef
    return url ? { kind: 'file', url, volume: file.volume } : null
  }

  const play = () => {
    const def = resolved()
    if (!def) return onError('The audio file for this is missing.')
    if (!isMusic) return previewSound(def as SoundDef)
    if (playing) {
      previewMusic(null)
      setPlaying(false)
    } else {
      previewMusic(def as MusicDef)
      setPlaying(true)
    }
  }

  const takeFile = async (f: File) => {
    const r = addAudioAsset(pack, f.name, new Uint8Array(await f.arrayBuffer()))
    if (!r.ok) return onError(r.message)
    const volume = typeof value.volume === 'number' ? value.volume : 0.8
    save(editPack(r.pack, setIn(overrideNode(r.pack.json, node), node.path, { kind: 'file', asset: r.assetId, volume }) as PackJson))
  }

  return (
    <div data-testid="sound-tools" style={{ marginBottom: '12px' }}>
      <div style={sectionHeading}>{isMusic ? 'LISTEN' : 'HEAR IT'}</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{ ...ui.button, borderColor: '#40d070', color: '#9fe39f' }} onClick={play}>
          {isMusic ? (playing ? '■ Stop' : '▶ Play') : '▶ Play'}
        </button>
        <button style={ui.button} onClick={() => input.current?.click()}>
          Use an audio file…
        </button>
        <input
          ref={input}
          type="file"
          accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void takeFile(f)
          }}
        />
        <span style={{ color: '#889' }}>
          {file ? 'Plays an audio file from the pack.' : isMusic ? 'A looping pattern played by the synth.' : 'Made by the synth: no file needed.'}
        </span>
      </div>
    </div>
  )
}
