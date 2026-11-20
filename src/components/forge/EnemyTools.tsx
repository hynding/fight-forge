import { useState } from 'react'
import { installBundle, describeErrors } from '../../content/library'
import { getIn, setIn } from '../../forge/paths'
import { AI_SLIDERS, ENEMY_SLIDERS, SANDBOX_MAX, sandboxLevel } from '../../forge/sandbox'
import { labelFor } from '../../forge/schemaForm'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { baseContent, editPack, exportBundle, type PackJson, type WorkspacePack } from '../../forge/workspace'
import { useGameStore } from '../../store/gameStore'
import { sectionHeading, ui } from './ui'

type Json = Record<string, unknown>

const Slider = ({
  label,
  value,
  range: [min, max, step],
  onChange,
}: {
  label: string
  value: number
  range: [number, number, number]
  onChange: (n: number) => void
}) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
    <span style={{ width: '110px', color: '#aab' }}>{label}</span>
    <input
      aria-label={`${label} slider`}
      type="range"
      min={min}
      max={Math.max(max, value)}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ flex: 1 }}
    />
    <span style={{ width: '48px', textAlign: 'right' }}>{Number(value.toFixed(3))}</span>
  </label>
)

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
  /** The pack has validation errors (the sandbox can't load it). */
  invalid: boolean
}

/** Enemy type tuning: stats and its AI archetype as sliders, and a sandbox fight against N of them. */
export const EnemyTools = ({ pack, node, save, onError, invalid }: Props) => {
  const json = pack.json
  const type = String(node.path[1])
  const enemy = (nodeValue(json, node) ?? {}) as Json
  const aiId = String(enemy.ai ?? '')
  const aiAll = { ...(baseContent().ai as Record<string, Json>), ...((json.ai ?? {}) as Record<string, Json>) }
  const ai = aiAll[aiId] as Json | undefined
  const sharedBy = Object.entries({ ...(baseContent().enemyTypes as Record<string, Json>), ...((json.enemyTypes ?? {}) as Record<string, Json>) }).filter(
    ([, t]) => t.ai === aiId
  ).length
  const [count, setCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const startSandbox = useGameStore((s) => s.startSandbox)

  const own = () => (node.status === 'inherited' ? overrideNode(json, node) : json)
  const setStat = (key: string, v: number | string) => save(editPack(pack, setIn(own(), [...node.path, key], v) as PackJson))
  const setAi = (key: string, v: number) => {
    if (!ai) return
    const current = (getIn(json, ['ai', aiId]) as Json | undefined) ?? structuredClone(ai)
    save(editPack(pack, setIn(json, ['ai', aiId], { ...current, [key]: v }) as PackJson))
  }

  const fight = async () => {
    setBusy(true)
    const r = await installBundle(await exportBundle(pack))
    setBusy(false)
    if (!r.ok) return onError(describeErrors(r.errors))
    startSandbox(sandboxLevel(type, count))
  }

  return (
    <div data-testid="enemy-tools">
      <div style={{ ...sectionHeading, display: 'flex', alignItems: 'center', gap: '8px' }}>
        SANDBOX
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label>
          Enemies{' '}
          <select aria-label="Sandbox count" style={ui.input} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: SANDBOX_MAX }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        <button
          style={{ ...ui.button, borderColor: '#ff4444', color: invalid ? '#777' : '#ff8080' }}
          disabled={invalid || busy}
          title={invalid ? 'Fix the problems first' : undefined}
          onClick={fight}
        >
          ▶ Fight {count} {type} now
        </button>
        <span style={{ color: '#667' }}>Leaving the fight comes back here.</span>
      </div>

      <div style={sectionHeading}>TUNING</div>
      {Object.entries(ENEMY_SLIDERS).map(([key, range]) =>
        typeof enemy[key] === 'number' || key === 'armor' ? (
          <Slider key={key} label={labelFor(key)} value={Number(enemy[key] ?? 0)} range={range} onChange={(v) => setStat(key, v)} />
        ) : null
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
        <span style={{ width: '110px', color: '#aab' }}>AI archetype</span>
        <select aria-label="AI archetype" style={ui.input} value={aiId} onChange={(e) => setStat('ai', e.target.value)}>
          {Object.keys(aiAll).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        {ai && (
          <span style={{ color: '#667' }}>
            {String(ai.approach)} · attacks from {String(ai.attackFrom)}
            {sharedBy > 1 && ` · shared by ${sharedBy} enemy types`}
          </span>
        )}
      </label>
      {ai &&
        Object.entries(AI_SLIDERS).map(([key, range]) => (
          <Slider key={key} label={labelFor(key)} value={Number(ai[key] ?? 0)} range={range} onChange={(v) => setAi(key, v)} />
        ))}
    </div>
  )
}
