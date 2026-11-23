import { useEffect, useState } from 'react'
import { bindKey, unbindKey } from '../../forge/bindings'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { effectiveActions } from '../../forge/fighter'
import { editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import {
  ACTION_NAMES,
  GAMEPAD_INPUTS,
  enabledActions,
  MOUSE_INPUTS,
  inputLabel,
  type Bindings,
  type DeviceBindings,
  type InputAction,
  type InputDevice,
} from '../../sim/input'
import { sectionHeading, ui } from './ui'
import { usePadCapture } from '../../input/usePadCapture'

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
}

/** A device's bindings, or player 2's keyboard map (`input.keyboard2`). */
type Tab = InputDevice | 'keyboard2'

const TABS: [Tab, string][] = [
  ['keyboard', 'KEYBOARD'],
  ['mouse', 'MOUSE'],
  ['gamepad', 'CONTROLLER'],
  ['keyboard2', 'KEYBOARD 2'],
]

/** Inputs offered from a list (the keyboard is captured by pressing a key instead). */
const CHOICES: Partial<Record<InputDevice, readonly string[]>> = { mouse: MOUSE_INPUTS, gamepad: GAMEPAD_INPUTS }

/**
 * The pack's default bindings, per device: each action's inputs as chips.
 * On the keyboard, "+ key" then a key press adds one; mouse and controller
 * inputs are picked from a list. Adding an input takes it off any other
 * action on that device. KEYBOARD 2 is player 2's keys (`input.keyboard2`).
 * Players can still remap for themselves on the start menu.
 */
export const BindingsTools = ({ pack, node, save }: Props) => {
  const json = pack.json
  const [tab, setTab] = useState<Tab>('keyboard')
  const device: InputDevice = tab === 'keyboard2' ? 'keyboard' : tab
  const input = nodeValue(json, node) as { bindings?: Partial<DeviceBindings>; keyboard2?: Bindings } | undefined
  const all = input?.bindings ?? {}
  // Heavy, special and the run button only when the pack turns them on.
  const actions = enabledActions(effectiveActions(json))
  const bindings = ((tab === 'keyboard2' ? input?.keyboard2 : all[device]) ?? {}) as Bindings
  // Player 2's keys that are also player 1's (player 2 takes them while playing on the keys).
  const p1Keys = new Set(Object.values(all.keyboard ?? {}).flat())
  const [listening, setListening] = useState<InputAction | null>(null)
  const label = (k: string) => inputLabel(device, k)
  const choices = CHOICES[device]

  const set = (next: Bindings) => {
    const own = node.status === 'inherited' ? overrideNode(json, node) : json
    const path = tab === 'keyboard2' ? [...node.path, 'keyboard2'] : [...node.path, 'bindings', device]
    save(editPack(pack, setIn(own, path, next) as PackJson))
  }

  usePadCapture(device === 'gamepad' && listening !== null, (b) => {
    if (listening) set(bindKey(bindings, listening, b))
    setListening(null)
  })

  useEffect(() => {
    if (!listening || device !== 'keyboard') return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setListening(null)
      if (e.key === 'Escape' && listening !== 'pause') return
      set(bindKey(bindings, listening, e.key))
    }
    // Capture, so the key never reaches anything else on the page.
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, tab])

  return (
    <div data-testid="bindings-tools">
      <div style={sectionHeading}>BINDINGS</div>
      <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {TABS.map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            style={{ ...ui.button, color: tab === id ? '#ffd27a' : undefined }}
            onClick={() => {
              setTab(id)
              setListening(null)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', alignItems: 'center' }}>
        {actions.map((action) => (
          <div key={action} style={{ display: 'contents' }}>
            <span style={{ color: '#aab' }}>{ACTION_NAMES[action]}</span>
            <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              {(bindings[action] ?? []).map((k) => (
                <span
                  key={k}
                  style={{ border: '1px solid #3a4258', borderRadius: '3px', padding: '1px 4px', color: tab === 'keyboard2' && p1Keys.has(k) ? '#ffd27a' : undefined }}
                  title={tab === 'keyboard2' && p1Keys.has(k) ? "Also player 1's: player 2 takes it while playing on the keys" : undefined}
                >
                  {label(k)}{' '}
                  <button
                    style={{ ...ui.button, padding: '0 4px' }}
                    aria-label={`Remove ${label(k)} from ${ACTION_NAMES[action]}`}
                    onClick={() => set(unbindKey(bindings, action, k))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {device === 'gamepad' && (
                <button
                  style={{ ...ui.button, padding: '0 6px', color: listening === action ? '#ffd27a' : undefined }}
                  aria-label={`Press a button for ${ACTION_NAMES[action]}`}
                  onClick={() => setListening(listening === action ? null : action)}
                >
                  {listening === action ? 'press a button…' : '+ press'}
                </button>
              )}
              {choices ? (
                <select
                  style={{ ...ui.button, padding: '0 4px' }}
                  aria-label={`Add an input to ${ACTION_NAMES[action]}`}
                  value=""
                  onChange={(e) => e.target.value && set(bindKey(bindings, action, e.target.value))}
                >
                  <option value="">+ add</option>
                  {choices
                    .filter((b) => !(bindings[action] ?? []).includes(b))
                    .map((b) => (
                      <option key={b} value={b}>
                        {label(b)}
                      </option>
                    ))}
                </select>
              ) : (
                <button
                  style={{ ...ui.button, padding: '0 6px', color: listening === action ? '#ffd27a' : undefined }}
                  aria-label={`Add a key to ${ACTION_NAMES[action]}`}
                  onClick={() => setListening(listening === action ? null : action)}
                >
                  {listening === action ? 'press a key… (Esc cancels)' : '+ key'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {tab === 'keyboard2' && (
        <div style={{ color: '#667', marginTop: '4px' }}>
          Player 2 joins a game by pressing their attack or pause key. Keys in yellow are also player 1's; while player 2 plays on the keys,
          they're player 2's. Player 1 must keep at least one key to move, attack and pause.
        </div>
      )}
      <div style={{ color: '#667', marginTop: '4px' }}>
        These are the pack's defaults for each device. An input can do one thing only, so adding it here takes it off any other action. The keyboard
        must be able to move, attack and pause, and the controller to move and pause. Controller names follow the Xbox layout. Players can still
        change their own controls on the start menu.
      </div>
    </div>
  )
}
