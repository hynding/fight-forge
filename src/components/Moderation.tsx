import { useEffect, useState, type CSSProperties } from 'react'
import { dismissReports, modActions, openReports, setOwnerBanned, setPackHidden, type ModAction, type Report } from '../net/api'

const button: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#dddddd',
  border: '1px solid #555555',
  borderRadius: '4px',
  padding: '4px 10px',
  fontFamily: 'monospace',
  fontSize: '13px',
  cursor: 'pointer',
}

/** Open reports, grouped by pack. */
const byPack = (reports: Report[]) => {
  const groups = new Map<string, Report[]>()
  for (const r of reports) groups.set(r.packId, [...(groups.get(r.packId) ?? []), r])
  return [...groups.values()]
}

/**
 * The moderators' view: open reports by pack, with take down, dismiss and
 * ban owner (each logged with a note), and the latest moderation log.
 */
export const Moderation = ({ onClose, onOpenPack }: { onClose: () => void; onOpenPack: (id: string) => void }) => {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [log, setLog] = useState<ModAction[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [confirmBan, setConfirmBan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () =>
    Promise.all([openReports(), modActions()])
      .then(([r, a]) => {
        setReports(r)
        setLog(a.slice(0, 20))
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    void reload()
  }, [])

  const act = (task: Promise<unknown>) => {
    setError(null)
    setConfirmBan(null)
    task.then(reload).catch((e: Error) => setError(e.message))
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        data-testid="moderation"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#151a2a', border: '1px solid #3a4258', borderRadius: '8px', width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '16px 18px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', flex: 1 }}>Reports</div>
          <button style={button} onClick={onClose}>
            Close
          </button>
        </div>
        {error && <div style={{ color: '#ff7a7a', marginBottom: '8px' }}>{error}</div>}
        {reports === null && !error && <div style={{ color: '#889' }}>Loading…</div>}
        {reports?.length === 0 && <div style={{ color: '#889' }}>No open reports.</div>}
        {reports &&
          byPack(reports).map((group) => {
            const r = group[0]
            const note = notes[r.packId] ?? ''
            return (
              <div key={r.packId} data-testid={`report-${r.packId}`} style={{ border: '1px solid #3a4258', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                <div style={{ marginBottom: '6px' }}>
                  {r.packName ? (
                    <button style={{ ...button, padding: '0 6px', color: '#ffd27a', border: 'none' }} onClick={() => onOpenPack(r.packId)}>
                      {r.packName}
                    </button>
                  ) : (
                    <span style={{ color: '#889' }}>{r.packId} (removed)</span>
                  )}
                  {r.packOwner && <span style={{ color: '#889' }}> by {r.packOwner}</span>}
                  {r.packHidden && <span style={{ color: '#ff9a7a' }}> · taken down</span>}
                </div>
                {group.map((x) => (
                  <div key={x.id} style={{ color: '#ccd', margin: '2px 0 2px 8px' }}>
                    <span style={{ color: '#889' }}>{x.reporter}:</span> {x.reason}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <input
                    aria-label="Moderator note"
                    placeholder="Note for the log"
                    style={{ ...button, cursor: 'text', background: '#10141f', flex: 1, minWidth: '160px' }}
                    value={note}
                    onChange={(e) => setNotes({ ...notes, [r.packId]: e.target.value })}
                  />
                  {r.packName && !r.packHidden && (
                    <button style={{ ...button, borderColor: '#ff7a7a', color: '#ff9a9a' }} onClick={() => act(setPackHidden(r.packId, true, note))}>
                      Take down
                    </button>
                  )}
                  <button style={button} onClick={() => act(dismissReports(r.id, note))}>
                    Dismiss
                  </button>
                  {r.packOwner &&
                    (confirmBan === r.packId ? (
                      <button style={{ ...button, borderColor: '#ff4444', color: '#ff6666' }} onClick={() => act(setOwnerBanned(r.packId, true, note))}>
                        Really ban {r.packOwner}?
                      </button>
                    ) : (
                      <button style={button} onClick={() => setConfirmBan(r.packId)}>
                        Ban owner
                      </button>
                    ))}
                </div>
              </div>
            )
          })}
        {log.length > 0 && (
          <>
            <div style={{ fontWeight: 'bold', margin: '14px 0 6px' }}>Recent actions</div>
            {log.map((a) => (
              <div key={a.id} style={{ color: '#99a' }}>
                {new Date(a.created).toLocaleString()} · {a.actor} · {a.action} {a.target}
                {a.note && ` · "${a.note}"`}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
