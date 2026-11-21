import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { describeErrors, installBundle } from '../../content/library'
import { bossPhaseSchema } from '../../content/schemas'
import { addPhase, bossSandboxLevel, defaultBoss, movePhase, phaseStartHealth, phaseSummary, removePhase } from '../../forge/boss'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { editPack, exportBundle, type PackJson, type WorkspacePack } from '../../forge/workspace'
import type { BossDef } from '../../sim/boss'
import { useGameStore } from '../../store/gameStore'
import { Field } from './SchemaForm'
import { sectionHeading, ui } from './ui'

type Json = Record<string, unknown>

const BAR_W = 520
const BAR_H = 26
const PAD = 10

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
  /** The pack has validation errors (the sandbox can't load it). */
  invalid: boolean
  errors: ReadonlyMap<string, string[]>
}

/**
 * The BOSS card on enemy types: make the type a boss, name it, and lay out its
 * phases on a health bar (click the bar to add a phase where you clicked, drag
 * a marker to move it). The selected phase is edited below with the
 * generated form. "Fight this boss" plays it in the sandbox from any phase.
 */
export const BossTools = ({ pack, node, save, onError, invalid, errors }: Props) => {
  const json = pack.json
  const type = String(node.path[1])
  const enemy = (nodeValue(json, node) ?? {}) as Json
  const boss = enemy.boss as BossDef | undefined
  const [selected, setSelected] = useState<number | null>(boss?.phases.length ? 0 : null)
  const [fromPhase, setFromPhase] = useState(0)
  const [busy, setBusy] = useState(false)
  const drag = useRef<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const startSandbox = useGameStore((s) => s.startSandbox)

  const own = () => (node.status === 'inherited' ? overrideNode(json, node) : json)
  const setBoss = (next: BossDef | undefined) => {
    const { boss: _old, ...rest } = enemy
    void _old
    save(editPack(pack, setIn(own(), node.path, next ? { ...rest, boss: next } : rest) as PackJson))
  }

  if (!boss) {
    return (
      <div data-testid="boss-tools">
        <div style={sectionHeading}>BOSS</div>
        <button style={ui.button} onClick={() => setBoss(defaultBoss(type))}>
          👑 Make {type} a boss
        </button>{' '}
        <span style={{ color: '#667' }}>Phases, a name card and health bar, poise, and its own attack slot.</span>
      </div>
    )
  }

  // Health fraction (1 at the left, full) from a pointer's X on the bar.
  const fractionAt = (e: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * (BAR_W + 2 * PAD) - PAD
    return Math.min(1, Math.max(0, x / BAR_W))
  }
  const xOf = (fraction: number) => PAD + fraction * BAR_W

  const fight = async () => {
    setBusy(true)
    const r = await installBundle(await exportBundle(pack))
    setBusy(false)
    if (!r.ok) return onError(describeErrors(r.errors))
    startSandbox(bossSandboxLevel(type), { packId: pack.id }, { bossHealth: phaseStartHealth(boss, fromPhase) })
  }

  const phase = selected !== null ? boss.phases[selected] : undefined
  const num = (v: string, fallback: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? fallback : Number(v))

  return (
    <div data-testid="boss-tools">
      <div style={sectionHeading}>BOSS</div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Title{' '}
          <input aria-label="Boss title" style={ui.input} maxLength={40} value={boss.title} onChange={(e) => setBoss({ ...boss, title: e.target.value })} />
        </label>
        <label>
          Subtitle{' '}
          <input
            aria-label="Boss subtitle"
            style={ui.input}
            maxLength={60}
            value={boss.subtitle ?? ''}
            onChange={(e) => setBoss({ ...boss, subtitle: e.target.value || undefined })}
          />
        </label>
        <label title="Hits in a row it takes before a knockdown lands (0: knockdowns always land)">
          Poise{' '}
          <input
            aria-label="Boss poise"
            type="number"
            min={0}
            step={1}
            style={{ ...ui.input, width: '50px' }}
            value={boss.poise.hits}
            onChange={(e) => setBoss({ ...boss, poise: { ...boss.poise, hits: Math.max(0, Math.round(num(e.target.value, boss.poise.hits))) } })}
          />{' '}
          hits
        </label>
        <label title="Off: it waits for an attack token like other enemies">
          <input type="checkbox" aria-label="Own attack slot" checked={!boss.sharesTokens} onChange={(e) => setBoss({ ...boss, sharesTokens: e.target.checked ? undefined : true })} />{' '}
          Attacks alongside its helpers
        </label>
        <button style={{ ...ui.button, marginLeft: 'auto' }} title="Make it an ordinary enemy again" onClick={() => setBoss(undefined)}>
          Not a boss
        </button>
      </div>

      <div style={{ color: '#aab', margin: '8px 0 2px' }}>Phases (click the bar to add one; drag a marker to move it)</div>
      <svg
        ref={svg}
        data-testid="boss-phase-bar"
        width="100%"
        viewBox={`0 0 ${BAR_W + 2 * PAD} ${BAR_H + 26}`}
        style={{ maxWidth: `${BAR_W + 2 * PAD}px`, touchAction: 'none', userSelect: 'none', cursor: 'copy' }}
        onPointerDown={(e) => {
          if (drag.current !== null) return
          const r = addPhase(boss, fractionAt(e))
          if (r.boss !== boss) setBoss(r.boss)
          setSelected(r.index)
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return
          setBoss(movePhase(boss, drag.current, fractionAt(e)))
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <rect x={PAD} y={4} width={BAR_W} height={BAR_H} fill="#e0303a" stroke="#ddd" strokeWidth={1.5} rx={3} />
        <text x={PAD} y={BAR_H + 22} fill="#889" fontSize={11}>
          0%
        </text>
        <text x={PAD + BAR_W} y={BAR_H + 22} fill="#889" fontSize={11} textAnchor="end">
          full health
        </text>
        {boss.phases.map((p, i) => (
          <g
            key={i}
            data-phase={i}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(e.target as Element).setPointerCapture?.(e.pointerId)
              drag.current = i
              setSelected(i)
            }}
          >
            <rect x={xOf(p.below) - 6} y={0} width={12} height={BAR_H + 8} fill="transparent" />
            <line x1={xOf(p.below)} x2={xOf(p.below)} y1={0} y2={BAR_H + 8} stroke={selected === i ? '#ffd27a' : '#ffffff'} strokeWidth={selected === i ? 4 : 2} />
            <text x={xOf(p.below)} y={BAR_H + 22} fill={selected === i ? '#ffd27a' : '#dde'} fontSize={11} textAnchor="middle">
              {i + 2} · {Math.round(p.below * 100)}%
            </text>
          </g>
        ))}
      </svg>

      {boss.phases.length === 0 && <div style={{ color: '#667' }}>No phases: it fights the same way all the way down.</div>}
      {boss.phases.map((p, i) => (
        <div key={i} style={{ color: selected === i ? '#ffd27a' : '#aab', cursor: 'pointer' }} onClick={() => setSelected(i)}>
          Phase {i + 2}, below {Math.round(p.below * 100)}%: {phaseSummary(p)}
        </div>
      ))}

      {phase && selected !== null && (
        <div data-testid="boss-phase" style={{ marginTop: '6px', padding: '6px', border: '1px solid #2c3346', borderRadius: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <b>Phase {selected + 2}</b>
            <span style={{ color: '#667' }}>Fields it leaves out keep the phase before's value.</span>
            <button
              style={{ ...ui.button, marginLeft: 'auto' }}
              onClick={() => {
                setBoss(removePhase(boss, selected))
                setSelected(null)
              }}
            >
              Delete phase
            </button>
          </div>
          <Field
            schema={bossPhaseSchema}
            value={phase}
            path={[...node.path, 'boss', 'phases', selected]}
            errors={errors}
            readOnly={false}
            onChange={(next) => setBoss({ ...boss, phases: boss.phases.map((q, j) => (j === selected ? (next as BossDef['phases'][number]) : q)) })}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <button
          style={{ ...ui.button, borderColor: '#ff4444', color: invalid ? '#777' : '#ff8080' }}
          disabled={invalid || busy}
          title={invalid ? 'Fix the problems first' : undefined}
          onClick={fight}
        >
          ▶ Fight this boss
        </button>
        <label>
          from{' '}
          <select aria-label="Fight from phase" style={ui.input} value={fromPhase} onChange={(e) => setFromPhase(Number(e.target.value))}>
            <option value={0}>the start</option>
            {boss.phases.map((p, i) => (
              <option key={i} value={i + 1}>
                phase {i + 2} ({Math.round(p.below * 100)}%)
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: '#667' }}>Leaving the fight comes back here.</span>
      </div>
    </div>
  )
}
