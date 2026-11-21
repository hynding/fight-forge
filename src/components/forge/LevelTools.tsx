import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { z } from 'zod'
import { describeErrors, installBundle } from '../../content/library'
import { levelItemSchema, propPlacementSchema, spawnSchema, triggerSchema } from '../../content/schemas'
import {
  addObject,
  addSegment,
  getObject,
  levelCut,
  levelFrom,
  levelObjects,
  moveObject,
  refPath,
  removeObject,
  resizeSegment,
  segmentStarts,
  setObject,
  snapDepth,
  snapX,
  splitSegment,
  type LevelRef,
  type NewObject,
} from '../../forge/level'
import { getIn, setIn } from '../../forge/paths'
import { spawnXOf } from '../../forge/playtest'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { baseContent, editPack, exportBundle, type PackJson, type WorkspacePack } from '../../forge/workspace'
import type { Level, SpawnDef, Trigger } from '../../sim/level'
import { useGameStore } from '../../store/gameStore'
import { Field } from './SchemaForm'
import { ui } from './ui'

type Json = Record<string, unknown>

const PX = 14 // pixels per world unit along the stage
const DPX = 22 // pixels per world unit across the lane (stretched so it's easy to place things in depth)
const PAD = 16
const RULER = 22

/** The cursor per level, so coming back from "Play from here" keeps it. */
const lastCursor = new Map<string, { x: number; depth: number }>()

const sameRef = (a: LevelRef | null, b: LevelRef) => !!a && JSON.stringify(a) === JSON.stringify(b)

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
  /** The pack has validation errors (it can't be played). */
  invalid: boolean
  errors: ReadonlyMap<string, string[]>
}

/**
 * The level editor: a top-down timeline of the stage (left to right, back of
 * the lane at the top) with its segments, fights, goal, pickups, props and
 * placed enemies. Drag to move, drag a segment's end to resize it, click the
 * stage to set the cursor, add things at the cursor, and play from it.
 */
export const LevelTools = ({ pack, node, save, onError, invalid, errors }: Props) => {
  const json = pack.json
  const level = nodeValue(json, node) as Level
  const merged = (key: string) => ({ ...(baseContent() as unknown as Record<string, Json>)[key], ...((json[key] ?? {}) as Json) }) as Record<string, Json>
  const enemyTypes = merged('enemyTypes')
  const pickups = merged('pickups')
  const props = merged('props')
  const settings = (section: string) => (getIn(json, ['settings', section]) ?? (baseContent().settings as unknown as Json)[section]) as Json
  const band = (settings('stage').depthBand as [number, number]) ?? [-3, 3]
  const spawnX = spawnXOf(json)
  const laneH = (band[1] - band[0]) * DPX

  const [sel, setSel] = useState<LevelRef | null>(null)
  const [{ x: cursor, depth: cursorDepth }, setCursorState] = useState(lastCursor.get(node.key) ?? { x: spawnX, depth: 0.5 })
  const [busy, setBusy] = useState(false)
  const [enemyType, setEnemyType] = useState(Object.keys(enemyTypes)[0] ?? '')
  const [pickup, setPickup] = useState(Object.keys(pickups)[0] ?? '')
  const [prop, setProp] = useState(Object.keys(props)[0] ?? '')
  const startSandbox = useGameStore((s) => s.startSandbox)
  const drag = useRef<{ x: number; y: number; level: Level; ref: LevelRef; x0: number; d0: number; resize?: boolean } | null>(null)

  const setCursor = (c: { x: number; depth: number }) => {
    lastCursor.set(node.key, c)
    setCursorState(c)
  }
  const setLevel = (next: Level) => {
    const own = node.status === 'inherited' ? overrideNode(json, node) : json
    save(editPack(pack, setIn(own, node.path, next) as PackJson))
  }

  const starts = segmentStarts(level)
  const total = starts[starts.length - 1]
  const width = total * PX + PAD * 2
  const height = RULER + laneH + 8
  const sx = (x: number) => PAD + x * PX
  const sy = (depth: number) => RULER + depth * laneH

  const begin = (ref: LevelRef, x0: number, d0 = 0.5, resize = false) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, level, ref, x0, d0, resize }
    setSel(ref)
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const x = d.x0 + (e.clientX - d.x) / PX
    if (d.resize && d.ref.kind === 'segment') return setLevel(resizeSegment(d.level, d.ref.seg, x))
    const r = moveObject(d.level, d.ref, x, d.d0 + (e.clientY - d.y) / laneH)
    setLevel(r.level)
    setSel(r.ref)
  }
  const onBackground = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCursor({
      x: snapX(Math.min(total, Math.max(0, (e.clientX - rect.left - PAD) / PX))),
      depth: snapDepth((e.clientY - rect.top - RULER) / laneH),
    })
    setSel(null)
  }

  const add = (what: NewObject) => {
    const r = addObject(level, cursor, what.kind === 'item' || what.kind === 'prop' ? { ...what, depth: cursorDepth } : what)
    setLevel(r.level)
    setSel(r.ref)
  }

  const play = async () => {
    setBusy(true)
    const r = await installBundle(await exportBundle(pack))
    setBusy(false)
    if (!r.ok) return onError(describeErrors(r.errors))
    startSandbox(levelFrom(level, cursor, spawnX), { packId: pack.id, level: { id: level.id, def: level, cut: levelCut(cursor, spawnX) } })
  }

  const objects = levelObjects(level)
  const selected = sel ? getObject(level, sel) : undefined

  return (
    <div data-testid="level-tools">
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ color: '#aab' }}>At the cursor ({cursor}):</span>
        <button style={ui.button} onClick={() => add({ kind: 'wave', enemyType })}>
          + Fight
        </button>
        <IdSelect label="Fight enemy" ids={Object.keys(enemyTypes)} value={enemyType} onChange={setEnemyType} />
        <button style={ui.button} onClick={() => add({ kind: 'item', pickup })}>
          + Pickup
        </button>
        <IdSelect label="Pickup kind" ids={Object.keys(pickups)} value={pickup} onChange={setPickup} />
        <button style={ui.button} onClick={() => add({ kind: 'prop', prop })}>
          + Prop
        </button>
        <IdSelect label="Prop kind" ids={Object.keys(props)} value={prop} onChange={setProp} />
        <button style={ui.button} onClick={() => add({ kind: 'goal' })}>
          + Goal
        </button>
        <button style={ui.button} title="Cut the segment under the cursor in two" onClick={() => setLevel(splitSegment(level, cursor))}>
          Split segment
        </button>
        <button style={ui.button} onClick={() => setLevel(addSegment(level))}>
          + Segment at end
        </button>
        <button
          style={{ ...ui.button, borderColor: '#ff4444', color: invalid ? '#777' : '#ff8080', marginLeft: 'auto' }}
          disabled={invalid || busy}
          title={invalid ? 'Fix the problems first' : 'Play this level with the player standing at the cursor'}
          onClick={play}
        >
          ▶ Play from here
        </button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #2c3346', borderRadius: '4px' }}>
        <svg
          data-testid="level-timeline"
          width={width}
          height={height}
          style={{ display: 'block', background: '#0b0e18', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={onBackground}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
        >
          {level.segments.map((s, i) => {
            const ref: LevelRef = { kind: 'segment', seg: i }
            return (
              <g key={`seg${i}`}>
                <rect
                  x={sx(starts[i])}
                  y={RULER}
                  width={s.length * PX}
                  height={laneH}
                  fill={i % 2 ? '#161b2c' : '#1b2135'}
                  stroke={sameRef(sel, ref) ? '#fff' : 'none'}
                />
                <text
                  data-testid={`segment-${i}`}
                  x={sx(starts[i]) + 4}
                  y={14}
                  fill={sameRef(sel, ref) ? '#fff' : '#8890a8'}
                  fontSize="10"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSel(ref)
                  }}
                >
                  Segment {i + 1} · {s.length}
                </text>
                <rect
                  data-testid={`segment-end-${i}`}
                  x={sx(starts[i + 1]) - 3}
                  y={2}
                  width={6}
                  height={RULER + laneH - 2}
                  fill="#3a4258"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={begin(ref, s.length, 0, true)}
                >
                  <title>Drag to change the segment's length</title>
                </rect>
              </g>
            )
          })}

          {objects.map((o) => {
            const key = JSON.stringify(o.ref)
            const on = sameRef(sel, o.ref)
            const stroke = on ? '#ffffff' : '#000000'
            const value = getObject(level, o.ref) as Json
            const testId = `${o.ref.kind}-${refPath(o.ref).filter((p) => typeof p === 'number').join('-')}`
            if (o.ref.kind === 'trigger') {
              const t = value as unknown as Trigger
              const color = t.kind === 'goal' ? '#40d070' : t.kind === 'boss' ? '#ff40c0' : t.lock ? '#ff6060' : '#d9b44a'
              const label =
                t.kind === 'goal'
                  ? 'GOAL'
                  : t.kind === 'boss'
                    ? `👑 ${t.enemy}`
                    : `${t.lock ? '🔒' : '⚔'} ${t.waves.reduce((n, w) => n + w.enemies.length, 0)}${t.waves.length > 1 ? ` in ${t.waves.length} waves` : ''}`
              return (
                <g key={key} data-testid={testId} style={{ cursor: 'ew-resize' }} onPointerDown={begin(o.ref, o.x)}>
                  <rect x={sx(o.x) - 7} y={RULER} width={14} height={laneH} fill="transparent" />
                  <line x1={sx(o.x)} x2={sx(o.x)} y1={RULER} y2={RULER + laneH} stroke={color} strokeWidth={on ? 3 : 2} />
                  <text x={sx(o.x) + 4} y={RULER + 11} fill={color} fontSize="10" fontWeight={on ? 'bold' : undefined}>
                    {label}
                  </text>
                </g>
              )
            }
            if (o.ref.kind === 'prop') {
              const def = props[String(value.prop)] as { size?: number[]; color?: string; shape?: string } | undefined
              const w = (def?.size?.[0] ?? 1) * PX
              const h = (def?.shape === 'cylinder' ? (def?.size?.[0] ?? 1) : (def?.size?.[2] ?? 1)) * DPX
              return (
                <rect
                  key={key}
                  data-testid={testId}
                  x={sx(o.x) - w / 2}
                  y={sy(o.depth!) - h / 2}
                  width={w}
                  height={h}
                  rx={def?.shape === 'cylinder' ? w / 2 : 1}
                  fill={def?.color ?? '#888'}
                  stroke={stroke}
                  style={{ cursor: 'move' }}
                  onPointerDown={begin(o.ref, o.x, o.depth)}
                >
                  <title>{String(value.prop)}</title>
                </rect>
              )
            }
            const color = o.ref.kind === 'enemy' ? String(enemyTypes[String(value.type)]?.color ?? '#ff5050') : String(pickups[String(value.pickup)]?.color ?? '#ffdd33')
            return o.ref.kind === 'enemy' ? (
              <circle key={key} data-testid={testId} cx={sx(o.x)} cy={sy(o.depth!)} r={6} fill={color} stroke={stroke} strokeWidth={2} style={{ cursor: 'move' }} onPointerDown={begin(o.ref, o.x, o.depth)}>
                <title>{String(value.type)}</title>
              </circle>
            ) : (
              <rect
                key={key}
                data-testid={testId}
                x={sx(o.x) - 5}
                y={sy(o.depth!) - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${sx(o.x)} ${sy(o.depth!)})`}
                fill={color}
                stroke={stroke}
                style={{ cursor: 'move' }}
                onPointerDown={begin(o.ref, o.x, o.depth)}
              >
                <title>{String(value.pickup)}</title>
              </rect>
            )
          })}

          <line x1={sx(cursor)} x2={sx(cursor)} y1={RULER - 4} y2={RULER + laneH} stroke="#ffffff" strokeDasharray="3 3" />
          <circle cx={sx(cursor)} cy={sy(cursorDepth)} r={3} fill="none" stroke="#fff" />
        </svg>
      </div>
      <div style={{ color: '#667', marginTop: '3px' }}>
        Seen from above: left to right is the stage, the top is the back wall. Click to set the cursor, drag to move, drag a segment's end to resize it.
        Fights: 🔒 holds the screen until cleared.
      </div>

      {sel && selected !== undefined && (
        <Selection
          key={JSON.stringify(sel)}
          level={level}
          sel={sel}
          value={selected}
          path={[...node.path, ...refPath(sel)]}
          errors={errors}
          enemyTypes={Object.keys(enemyTypes)}
          pickups={Object.keys(pickups)}
          props={Object.keys(props)}
          onSelect={setSel}
          onChange={(next, ref = sel) => {
            setLevel(next)
            setSel(ref)
          }}
          onDelete={() => {
            setLevel(removeObject(level, sel))
            setSel(null)
          }}
        />
      )}
    </div>
  )
}

const IdSelect = ({ label, ids, value, onChange }: { label: string; ids: string[]; value: string; onChange: (id: string) => void }) => (
  <select aria-label={label} style={ui.input} value={value} onChange={(e) => onChange(e.target.value)}>
    {!ids.includes(value) && <option value={value}>{value || '(none)'} (missing)</option>}
    {ids.map((id) => (
      <option key={id}>{id}</option>
    ))}
  </select>
)

const SCHEMA: Record<Exclude<LevelRef['kind'], 'segment'>, z.ZodTypeAny> = {
  trigger: triggerSchema,
  item: levelItemSchema,
  prop: propPlacementSchema,
  enemy: spawnSchema,
}

/** The selected object's details: quick controls, then all its fields. */
const Selection = ({
  level,
  sel,
  value,
  path,
  errors,
  enemyTypes,
  pickups,
  props,
  onSelect,
  onChange,
  onDelete,
}: {
  level: Level
  sel: LevelRef
  value: unknown
  path: (string | number)[]
  errors: ReadonlyMap<string, string[]>
  enemyTypes: string[]
  pickups: string[]
  props: string[]
  onSelect: (ref: LevelRef) => void
  onChange: (level: Level, ref?: LevelRef) => void
  onDelete: () => void
}) => {
  const set = (next: unknown) => onChange(setObject(level, sel, next))
  const v = value as Json
  let quick: ReactNode = null
  let title = ''
  if (sel.kind === 'segment') {
    title = `Segment ${sel.seg + 1}`
    quick = (
      <label>
        Length{' '}
        <input
          aria-label="Segment length"
          type="number"
          style={{ ...ui.input, width: '70px' }}
          value={Number(v.length)}
          onChange={(e) => onChange(resizeSegment(level, sel.seg, Number(e.target.value)))}
        />
      </label>
    )
  } else if (sel.kind === 'trigger' && v.kind === 'wave') {
    const t = value as Extract<Trigger, { kind: 'wave' }>
    title = 'Fight'
    quick = <WaveEditor trigger={t} sel={sel} enemyTypes={enemyTypes} onSelect={onSelect} set={set} />
  } else if (sel.kind === 'trigger') title = 'Goal'
  else if (sel.kind === 'item') {
    title = 'Pickup'
    quick = <IdSelect label="Pickup" ids={pickups} value={String(v.pickup)} onChange={(id) => set({ ...v, pickup: id })} />
  } else if (sel.kind === 'prop') {
    title = 'Prop'
    quick = <IdSelect label="Prop" ids={props} value={String(v.prop)} onChange={(id) => set({ ...v, prop: id })} />
  } else {
    title = 'Enemy placed in a fight'
    quick = <IdSelect label="Enemy type" ids={enemyTypes} value={String(v.type)} onChange={(id) => set({ ...v, type: id })} />
  }
  return (
    <div data-testid="level-selection" style={{ marginTop: '8px', padding: '8px', border: '1px solid #2c3346', borderRadius: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <b>{title}</b>
        {quick}
        <button
          style={{ ...ui.button, marginLeft: 'auto' }}
          disabled={sel.kind === 'segment' && level.segments.length < 2}
          title={sel.kind === 'segment' ? 'Remove the segment and everything in it' : undefined}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      {sel.kind !== 'segment' && <Field schema={SCHEMA[sel.kind]} value={value} path={path} errors={errors} readOnly={false} onChange={set} />}
    </div>
  )
}

/** A fight's waves: who comes in each, from where, and whether the screen locks. */
const WaveEditor = ({
  trigger,
  sel,
  enemyTypes,
  onSelect,
  set,
}: {
  trigger: Extract<Trigger, { kind: 'wave' }>
  sel: { seg: number; index: number }
  enemyTypes: string[]
  onSelect: (ref: LevelRef) => void
  set: (t: Trigger) => void
}) => {
  const [type, setType] = useState(enemyTypes[0] ?? '')
  const [from, setFrom] = useState<SpawnDef['from']>('right')
  const setWave = (wi: number, enemies: SpawnDef[]) =>
    set({ ...trigger, waves: enemies.length ? trigger.waves.map((w, i) => (i === wi ? { enemies } : w)) : trigger.waves.filter((_, i) => i !== wi) })
  const newEnemy = (): SpawnDef => (from === 'placed' ? { type, from, x: 3, depth: 0.5 } : { type, from })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
      <label>
        <input type="checkbox" aria-label="Lock screen" checked={!!trigger.lock} onChange={(e) => set({ ...trigger, lock: e.target.checked })} /> Hold the
        screen until everyone is beaten
      </label>
      {trigger.waves.map((w, wi) => (
        <div key={wi} data-testid={`wave-${wi}`} style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#889' }}>Wave {wi + 1}:</span>
          {w.enemies.map((e, ei) => (
            <span key={ei} style={{ border: '1px solid #3a4258', borderRadius: '3px', padding: '1px 4px' }}>
              <span
                style={{ cursor: e.from === 'placed' ? 'pointer' : undefined }}
                onClick={() => e.from === 'placed' && onSelect({ kind: 'enemy', seg: sel.seg, index: sel.index, wave: wi, enemy: ei })}
              >
                {e.type} {e.from === 'right' ? '←' : e.from === 'left' ? '→' : '•'}
              </span>{' '}
              {(trigger.waves.length > 1 || w.enemies.length > 1) && (
                <button style={{ ...ui.button, padding: '0 4px' }} title="Take out" onClick={() => setWave(wi, w.enemies.filter((_, j) => j !== ei))}>
                  ×
                </button>
              )}
            </span>
          ))}
          <button style={{ ...ui.button, padding: '0 4px' }} title={`Add a ${type} from ${from}`} onClick={() => setWave(wi, [...w.enemies, newEnemy()])}>
            +
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <span style={{ color: '#889' }}>Adds:</span>
        <IdSelect label="Wave enemy" ids={enemyTypes} value={type} onChange={setType} />
        <select aria-label="Comes from" style={ui.input} value={from} onChange={(e) => setFrom(e.target.value as SpawnDef['from'])}>
          <option value="right">walks in from the right</option>
          <option value="left">walks in from the left</option>
          <option value="placed">already standing there</option>
        </select>
        <button style={ui.button} onClick={() => set({ ...trigger, waves: [...trigger.waves, { enemies: [newEnemy()] }] })}>
          + Wave
        </button>
      </div>
    </div>
  )
}
