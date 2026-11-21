import { useEffect, useState } from 'react'
import { describeErrors } from '../../content/library'
import { editPack, exportBundle, type WorkspacePack } from '../../forge/workspace'
import {
  currentUser,
  devSignIn,
  githubSignInUrl,
  myPacks,
  nextVersion,
  publishBundle,
  serverOptions,
  signOut,
  type ApiUser,
  type PublishedPack,
  type Visibility,
} from '../../net/api'
import { sectionHeading, ui } from './ui'

const VISIBILITY_TEXT: Record<Visibility, string> = {
  public: 'Public: in the gallery for everyone',
  unlisted: 'Unlisted: only people with the link',
  private: 'Private: only you',
}

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i]
  return false
}

interface Props {
  pack: WorkspacePack
  save: (wp: WorkspacePack) => void
  /** The pack has validation errors (it can't be published). */
  invalid: boolean
}

/** Publishing the pack online: sign in, pick who can see it, and publish this version. */
export const PublishTools = ({ pack, save, invalid }: Props) => {
  const [options, setOptions] = useState<{ devLogin: boolean; github: boolean } | null>(null)
  const [user, setUser] = useState<ApiUser | null | undefined>(undefined)
  const [published, setPublished] = useState<PublishedPack | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([serverOptions(), currentUser()])
      .then(([o, u]) => {
        if (!live) return
        setOptions(o)
        setUser(u)
      })
      .catch(() => live && setOffline(true))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!user) return setPublished(null)
    let live = true
    myPacks().then((list) => {
      if (!live) return
      const mine = list.find((p) => p.id === pack.id) ?? null
      setPublished(mine)
      if (mine) setVisibility(mine.visibility)
    })
    return () => {
      live = false
    }
  }, [user, pack.id])

  const version = String(pack.json.version)
  const needsBump = published !== null && !newer(version, published.version)

  const onPublish = async () => {
    setBusy(true)
    setMessage(null)
    const r = await publishBundle(await exportBundle(pack), visibility)
    setBusy(false)
    if (r.ok) {
      setPublished(r.pack)
      setMessage({ text: `Published ${r.pack.name} v${r.pack.version}.` })
    } else setMessage({ text: r.errors ? `${r.message}\n${describeErrors(r.errors)}` : r.message, error: true })
  }

  return (
    <div data-testid="publish-tools">
      <div style={sectionHeading}>PUBLISH ONLINE</div>
      {offline && <div style={ui.error}>The pack server can't be reached right now.</div>}
      {!offline && user === undefined && <div style={{ color: '#889' }}>Checking…</div>}

      {!offline && user === null && options && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#aab' }}>Sign in to publish your pack.</span>
          {options.github && (
            <a style={{ ...ui.button, textDecoration: 'none' }} href={githubSignInUrl(window.location.href)}>
              Sign in with GitHub
            </a>
          )}
          {options.devLogin && (
            <>
              <input aria-label="Dev name" placeholder="name (dev sign-in)" style={ui.input} value={name} onChange={(e) => setName(e.target.value)} />
              <button
                style={ui.button}
                disabled={!name.trim()}
                onClick={() =>
                  devSignIn(name)
                    .then(setUser)
                    .catch((e: Error) => setMessage({ text: e.message, error: true }))
                }
              >
                Sign in (dev)
              </button>
            </>
          )}
          {!options.github && !options.devLogin && <span style={ui.error}>No sign-in is set up on the server.</span>}
        </div>
      )}

      {user && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#aab' }}>
              Signed in as <b>{user.name}</b>
            </span>
            <button style={ui.button} onClick={() => signOut().then(() => setUser(null))}>
              Sign out
            </button>
          </div>
          <div style={{ color: '#aab' }} data-testid="publish-status">
            {published ? `Published: v${published.version}, ${published.visibility}.` : 'Not published yet.'}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select aria-label="Visibility" style={ui.input} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              {(Object.keys(VISIBILITY_TEXT) as Visibility[]).map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_TEXT[v]}
                </option>
              ))}
            </select>
            {needsBump ? (
              <button
                style={{ ...ui.button, borderColor: '#ffd27a', color: '#ffd27a' }}
                title="Each publish needs a newer version number"
                onClick={() => save(editPack(pack, { ...pack.json, version: nextVersion(published!.version) }))}
              >
                Make it v{nextVersion(published!.version)}
              </button>
            ) : (
              <button
                style={{ ...ui.button, borderColor: '#40d070', color: invalid ? '#777' : '#9fe39f' }}
                disabled={invalid || busy}
                title={invalid ? 'Fix the problems first' : undefined}
                onClick={onPublish}
              >
                {busy ? 'Publishing…' : `Publish v${version}`}
              </button>
            )}
          </div>
          <div style={{ color: '#667' }}>
            License: {String((pack.json.meta as Record<string, unknown> | undefined)?.license ?? '')}. Only publish models and images you made or may share
            under it.
          </div>
        </div>
      )}
      {message && <pre style={{ ...(message.error ? ui.error : { color: '#9fe39f' }), whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{message.text}</pre>}
    </div>
  )
}
