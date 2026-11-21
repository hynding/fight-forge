import { useEffect, useState } from 'react'
import { bindKey, unbindKey } from '../../forge/bindings'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import {
  ACTION_NAMES,
  GAMEPAD_INPUTS,
  INPUT_ACTIONS,
  MOUSE_INPUTS,
  inputLabel,
  type Bindings,
  type DeviceBindings,
  type InputAction,
  type InputDevice,
} from '../../sim/input'
import { sectionHeading, ui } from './ui'

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
}

const TABS: [InputDevice, string][] = [
  ['keyboard', 'KEYBOARD'],
  ['mouse', 'MOUSE'],
  ['gamepad', 'CONTROLLER'],
]

/** Inputs offered from a list (the keyboard is captured by pressing a key instead). */
const CHOICES: Partial<Record<InputDevice, readonly string[]>> = { mouse: MOUSE_INPUTS, gamepad: GAMEPAD_INPUTS }

/**
 * The pack's default bindings, per device: each action's inputs as chips.
 * On the keyboard, "+ key" then a key press adds one; mouse and controller
 * inputs are picked from a list. Adding an input takes it off any other
 * action on that device. Players can still remap for themselves on the start menu.
 */
export const BindingsTools = ({ pack, node, save }: Props) => {
  const json = pack.json
  const [device, setDevice] = useState<InputDevice>('keyboard')
  const all = (nodeValue(json, node) as { bindings?: Partial<DeviceBindings> } | undefined)?.bindings ?? {}
  const bindings = (all[device] ?? {}) as Bindings
  const [listening, setListening] = useState<InputAction | null>(null)
  const label = (k: string) => inputLabel(device, k)
  const choices = CHOICES[device]

  const set = (next: Bindings) => {
    const own = node.status === 'inherited' ? overrideNode(json, node) : json
    save(editPack(pack, setIn(own, [...node.path, 'bindings', device], next) as PackJson))
  }

  useEffect(() => {
    if (!listening) return
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
  }, [listening])

  return (
    <div data-testid="bindings-tools">
      <div style={sectionHeading}>BINDINGS</div>
      <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {TABS.map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={device === id}
            style={{ ...ui.button, color: device === id ? '#ffd27a' : undefined }}
            onClick={() => {
              setDevice(id)
              setListening(null)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', alignItems: 'center' }}>
        {INPUT_ACTIONS.map((action) => (
          <div key={action} style={{ display: 'contents' }}>
            <span style={{ color: '#aab' }}>{ACTION_NAMES[action]}</span>
            <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              {(bindings[action] ?? []).map((k) => (
                <span key={k} style={{ border: '1px solid #3a4258', borderRadius: '3px', padding: '1px 4px' }}>
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
      <div style={{ color: '#667', marginTop: '4px' }}>
        These are the pack's defaults for each device. An input can do one thing only, so adding it here takes it off any other action. The keyboard
        must be able to move, attack and pause, and the controller to move and pause. Controller names follow the Xbox layout. Players can still
        change their own controls on the start menu.
      </div>
    </div>
  )
}
