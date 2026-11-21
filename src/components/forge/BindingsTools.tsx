import { useEffect, useState } from 'react'
import { bindKey, unbindKey } from '../../forge/bindings'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import { ACTION_NAMES, INPUT_ACTIONS, keyLabel, type Bindings, type InputAction } from '../../sim/input'
import { sectionHeading, ui } from './ui'

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
}

/**
 * The pack's default keys: each action's keys as chips; "+ key" then a key
 * press adds one (taking it off any other action). Players can still remap
 * keys for themselves on the start menu.
 */
export const BindingsTools = ({ pack, node, save }: Props) => {
  const json = pack.json
  const bindings = ((nodeValue(json, node) as { bindings?: Bindings } | undefined)?.bindings ?? {}) as Bindings
  const [listening, setListening] = useState<InputAction | null>(null)

  const set = (next: Bindings) => {
    const own = node.status === 'inherited' ? overrideNode(json, node) : json
    save(editPack(pack, setIn(own, [...node.path, 'bindings'], next) as PackJson))
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
      <div style={sectionHeading}>KEYS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', alignItems: 'center' }}>
        {INPUT_ACTIONS.map((action) => (
          <div key={action} style={{ display: 'contents' }}>
            <span style={{ color: '#aab' }}>{ACTION_NAMES[action]}</span>
            <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              {(bindings[action] ?? []).map((k) => (
                <span key={k} style={{ border: '1px solid #3a4258', borderRadius: '3px', padding: '1px 4px' }}>
                  {keyLabel(k)}{' '}
                  <button
                    style={{ ...ui.button, padding: '0 4px' }}
                    aria-label={`Remove ${keyLabel(k)} from ${ACTION_NAMES[action]}`}
                    onClick={() => set(unbindKey(bindings, action, k))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                style={{ ...ui.button, padding: '0 6px', color: listening === action ? '#ffd27a' : undefined }}
                aria-label={`Add a key to ${ACTION_NAMES[action]}`}
                onClick={() => setListening(listening === action ? null : action)}
              >
                {listening === action ? 'press a key… (Esc cancels)' : '+ key'}
              </button>
            </span>
          </div>
        ))}
      </div>
      <div style={{ color: '#667', marginTop: '4px' }}>
        These are the pack's keys. A key can do one thing only, so adding it here takes it off any other action. Players can still change keys for
        themselves on the start menu.
      </div>
    </div>
  )
}
