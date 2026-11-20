import { useEffect, useState } from 'react'
import { getBindings, getOverride, getPackBindings, setOverride } from '../content/bindings'
import { ACTION_NAMES, INPUT_ACTIONS, actionLabel, rebind, type InputAction } from '../sim/input'

const small = {
  padding: '3px 8px',
  fontSize: '12px',
  fontFamily: 'monospace',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  color: '#dddddd',
  border: '1px solid #555555',
  borderRadius: '4px',
  cursor: 'pointer',
} as const

/**
 * Key remapping on the start menu. The pack sets the default keys; changes
 * here are this browser's preference (localStorage) and apply to the next
 * run. Choosing CHANGE then pressing a key binds it to that action alone,
 * taking it off any other action.
 */
export const ControlsPanel = ({ onChange }: { onChange: () => void }) => {
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState<InputAction | null>(null)
  // The bindings live outside React; bump to re-render after a change.
  const [, setVersion] = useState(0)
  const changed = () => {
    setVersion((v) => v + 1)
    onChange()
  }

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setOverride(rebind(getOverride(), getPackBindings(), listening, e.key))
      setListening(null)
      changed()
    }
    // Capture, so the key never reaches anything else on the page.
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])

  const bindings = getBindings()
  const customized = Object.keys(getOverride()).length > 0

  return (
    <div
      data-testid="controls-panel"
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: open ? '320px' : 'auto',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        padding: '14px',
        background: 'rgba(0, 0, 0, 0.45)',
        border: '1px solid #444444',
        borderRadius: '8px',
        fontSize: '13px',
        zIndex: 2,
      }}
    >
      <button
        onClick={() => {
          setOpen(!open)
          setListening(null)
        }}
        aria-expanded={open}
        style={{ ...small, border: 'none', background: 'none', fontSize: '14px', color: '#aaaaaa', letterSpacing: '3px', padding: 0 }}
      >
        {open ? '▾' : '▸'} CONTROLS{customized ? ' (CUSTOM)' : ''}
      </button>
      {open && (
        <div style={{ marginTop: '10px' }}>
          {INPUT_ACTIONS.map((action) => (
            <div key={action} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ flex: 1, color: '#bbbbbb' }}>{ACTION_NAMES[action]}</span>
              <span style={{ minWidth: '90px', textAlign: 'right' }}>
                {listening === action ? 'press a key…' : actionLabel(bindings, action)}
              </span>
              <button
                style={small}
                aria-label={`Change ${ACTION_NAMES[action]}`}
                onClick={() => setListening(listening === action ? null : action)}
              >
                {listening === action ? 'CANCEL' : 'CHANGE'}
              </button>
            </div>
          ))}
          <button
            style={{ ...small, marginTop: '6px' }}
            disabled={!customized}
            onClick={() => {
              setOverride({})
              changed()
            }}
          >
            Reset to pack defaults
          </button>
        </div>
      )}
    </div>
  )
}
