import { useEffect, useState } from 'react'
import { getBindings, getOverride, getPackBindings, setDeviceOverride } from '../content/bindings'
import { bindKey, unbindKey } from '../forge/bindings'
import {
  ACTION_NAMES,
  GAMEPAD_INPUTS,
  enabledActions,
  MOUSE_BUTTONS,
  actionLabel,
  inputLabel,
  rebind,
  type InputAction,
  type InputDevice,
} from '../sim/input'
import { VolumeControls } from './VolumeControls'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { loadControlPrefs, saveControlPrefs } from '../input/prefs'
import { usePadCapture } from '../input/usePadCapture'

const PAD_SET_NAMES = { xbox: 'Xbox', playstation: 'PlayStation', nintendo: 'Nintendo', generic: 'standard' } as const

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
type Tab = 'keyboard' | 'gamepad'

/**
 * Remapping on the start menu, per device. The pack sets the defaults;
 * changes here are this browser's preference (localStorage) and apply to the
 * next run. On the keyboard & mouse tab, CHANGE then a key or a mouse button
 * (or the wheel) binds it to that action alone, taking it off any other
 * action. The controller tab adds and removes buttons from lists.
 */
export const ControlsPanel = ({ onChange }: { onChange: () => void }) => {
  const [open, setOpen] = useState(false)
  const [soundOpen, setSoundOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('keyboard')
  const [listening, setListening] = useState<InputAction | null>(null)
  const [padListening, setPadListening] = useState<InputAction | null>(null)
  const padLabels = useGameStore((state) => state.padLabels)
  // The bindings live outside React; bump to re-render after a change.
  const [, setVersion] = useState(0)
  const changed = () => {
    setVersion((v) => v + 1)
    onChange()
  }
  const rebindOn = (device: InputDevice, action: InputAction, input: string) => {
    setDeviceOverride(device, rebind(getOverride()[device] ?? {}, getPackBindings()[device], action, input))
    setListening(null)
    changed()
  }

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      rebindOn('keyboard', listening, e.key)
    }
    const onMouse = (e: MouseEvent) => {
      // The row's CANCEL button cancels instead of binding the click.
      if ((e.target as Element | null)?.closest?.('[data-cancel-capture]')) return
      const button = MOUSE_BUTTONS[e.button]
      if (!button) return
      e.preventDefault()
      e.stopPropagation()
      rebindOn('mouse', listening, button)
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      rebindOn('mouse', listening, e.deltaY < 0 ? 'wheelup' : 'wheeldown')
    }
    const noMenu = (e: Event) => e.preventDefault()
    // Capture, so the input never reaches anything else on the page.
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('mousedown', onMouse, { capture: true })
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('contextmenu', noMenu, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('mousedown', onMouse, { capture: true })
      window.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('contextmenu', noMenu, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])

  const bindings = getBindings()
  // Only the actions this pack uses (heavy, special and the run button can be off).
  const packActions = getConfig().input.actions
  const actions = enabledActions(packActions)
  const prefs = loadControlPrefs()
  const check = (label: string, key: 'toggleBlock' | 'faceCursor', hint: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }} title={hint}>
      <span style={{ flex: 1, color: '#bbbbbb' }}>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={prefs[key]}
        onChange={(e) => {
          saveControlPrefs({ ...loadControlPrefs(), [key]: e.target.checked })
          changed()
        }}
      />
    </label>
  )
  const padName = (b: string) => inputLabel('gamepad', b, padLabels ?? 'xbox')
  const deadZone = loadControlPrefs().deadZone ?? getConfig().input.analog.deadZone
  const override = getOverride()
  const customized = Object.keys(override).length > 0
  const tabCustomized = tab === 'keyboard' ? !!(override.keyboard || override.mouse) : !!override.gamepad || loadControlPrefs().deadZone !== null
  const setPad = (next: typeof bindings.gamepad) => {
    setDeviceOverride('gamepad', next)
    changed()
  }
  usePadCapture(padListening !== null, (b) => {
    if (padListening) setPad(bindKey(bindings.gamepad, padListening, b))
    setPadListening(null)
  })

  return (
    <div
      data-testid="controls-panel"
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: open || soundOpen ? '340px' : 'auto',
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
          setPadListening(null)
        }}
        aria-expanded={open}
        style={{ ...small, border: 'none', background: 'none', fontSize: '14px', color: '#aaaaaa', letterSpacing: '3px', padding: 0 }}
      >
        {open ? '▾' : '▸'} CONTROLS{customized ? ' (CUSTOM)' : ''}
      </button>
      {open && (
        <div style={{ marginTop: '10px' }}>
          <div role="tablist" style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {(
              [
                ['keyboard', 'KEYBOARD & MOUSE'],
                ['gamepad', 'CONTROLLER'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                style={{ ...small, color: tab === id ? '#ffd27a' : '#aaaaaa', borderColor: tab === id ? '#ffd27a' : '#555555' }}
                onClick={() => {
                  setTab(id)
                  setListening(null)
                  setPadListening(null)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'keyboard' &&
            actions.map((action) => {
              const mouse = bindings.mouse[action].length ? actionLabel(bindings.mouse, action, 'mouse') : ''
              const keys = bindings.keyboard[action].length ? actionLabel(bindings.keyboard, action) : ''
              return (
                <div key={action} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ flex: 1, color: '#bbbbbb' }}>{ACTION_NAMES[action]}</span>
                  <span style={{ minWidth: '110px', textAlign: 'right' }}>
                    {listening === action ? 'press a key or click…' : [keys, mouse].filter(Boolean).join(' / ') || '—'}
                  </span>
                  <button
                    style={small}
                    data-cancel-capture={listening === action ? '' : undefined}
                    aria-label={`Change ${ACTION_NAMES[action]}`}
                    onClick={() => setListening(listening === action ? null : action)}
                  >
                    {listening === action ? 'CANCEL' : 'CHANGE'}
                  </button>
                </div>
              )
            })}
          {tab === 'gamepad' && (
            <>
              <div style={{ color: padLabels ? '#88cc88' : '#888888', marginBottom: '8px' }}>
                {padLabels ? `Controller ready (${PAD_SET_NAMES[padLabels]} buttons).` : 'Press any button on your controller.'} To add a button,
                choose + and press it, or pick it from the list.
              </div>
              {actions.map((action) => (
                <div key={action} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 0 120px', color: '#bbbbbb' }}>{ACTION_NAMES[action]}</span>
                  {bindings.gamepad[action].map((b) => (
                    <button
                      key={b}
                      style={{ ...small, padding: '1px 5px' }}
                      aria-label={`Remove ${padName(b)} from ${ACTION_NAMES[action]}`}
                      onClick={() => setPad(unbindKey(bindings.gamepad, action, b))}
                    >
                      {padName(b)} ×
                    </button>
                  ))}
                  <button
                    style={{ ...small, padding: '1px 6px', color: padListening === action ? '#ffd27a' : undefined }}
                    aria-label={`Press a button for ${ACTION_NAMES[action]}`}
                    onClick={() => setPadListening(padListening === action ? null : action)}
                  >
                    {padListening === action ? 'press a button…' : '+'}
                  </button>
                  <select
                    style={{ ...small, padding: '1px 2px', width: '44px' }}
                    aria-label={`Add a button to ${ACTION_NAMES[action]}`}
                    value=""
                    onChange={(e) => e.target.value && setPad(bindKey(bindings.gamepad, action, e.target.value))}
                  >
                    <option value="">…</option>
                    {GAMEPAD_INPUTS.filter((b) => !bindings.gamepad[action].includes(b)).map((b) => (
                      <option key={b} value={b}>
                        {padName(b)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ flex: 1, color: '#bbbbbb' }}>Stick dead zone</span>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.05}
                  value={deadZone}
                  aria-label="Stick dead zone"
                  onChange={(e) => {
                    saveControlPrefs({ ...loadControlPrefs(), deadZone: Number(e.target.value) })
                    changed()
                  }}
                />
                <span style={{ width: '36px', textAlign: 'right' }}>{deadZone.toFixed(2)}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{ flex: 1, color: '#bbbbbb' }}>Vibration</span>
                <input
                  type="checkbox"
                  checked={loadControlPrefs().rumble}
                  onChange={(e) => {
                    saveControlPrefs({ ...loadControlPrefs(), rumble: e.target.checked })
                    changed()
                  }}
                />
              </label>
            </>
          )}
          {packActions.block.mode === 'hold' && check('Toggle block', 'toggleBlock', 'Press block once to raise the guard and again to lower it')}
          {tab === 'keyboard' && check('Face the cursor', 'faceCursor', 'Standing still, turn toward the mouse pointer')}
          <button
            style={{ ...small, marginTop: '6px' }}
            disabled={!tabCustomized}
            onClick={() => {
              if (tab === 'keyboard') {
                setDeviceOverride('keyboard', {})
                setDeviceOverride('mouse', {})
              } else {
                setDeviceOverride('gamepad', {})
                saveControlPrefs({ ...loadControlPrefs(), deadZone: null })
              }
              setListening(null)
              changed()
            }}
          >
            Reset this device
          </button>
        </div>
      )}
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={() => setSoundOpen(!soundOpen)}
          aria-expanded={soundOpen}
          style={{ ...small, border: 'none', background: 'none', fontSize: '14px', color: '#aaaaaa', letterSpacing: '3px', padding: 0 }}
        >
          {soundOpen ? '▾' : '▸'} SOUND
        </button>
        {soundOpen && (
          <div style={{ marginTop: '10px', minWidth: '260px' }}>
            <VolumeControls />
          </div>
        )}
      </div>
    </div>
  )
}
