import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { FRAME, fighterHalfExtents, moveFrames, moveLength, phaseAt, type MoveTiming } from '../../forge/fighter'
import { getIn, setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { baseContent, editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import { resolveFighterClip, type ClipMap, type ClipRef } from '../../sim/animation'
import { ModelPreview, type PreviewBox } from './ModelPreview'
import { sectionHeading, ui } from './ui'
import { usePreviewModel } from './useModelUrl'

type Json = Record<string, unknown>
interface Hitbox {
  forward: number
  up: number
  halfX: number
  halfY: number
  halfZ: number
}

const PHASE_COLOR = { startup: '#d9b44a', active: '#e05050', recovery: '#4a7fd9' } as const
const round = (n: number) => Math.round(n * 100) / 100

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
}

/**
 * Move tools: the player's model performing the move with a frame scrubber,
 * the phases on a timeline, the hitbox in 3D, and a side view where the
 * hitbox can be dragged and resized.
 */
export const MoveTools = ({ pack, node, save }: Props) => {
  const json = pack.json
  const move = (nodeValue(json, node) ?? {}) as Json & MoveTiming & { hitbox: Hitbox; clip?: ClipRef }
  const player = (getIn(json, ['settings', 'player']) ?? baseContent().settings.player) as Json
  const model = player.model as Json | undefined
  const preview = usePreviewModel(pack, model)
  const [clipNames, setClipNames] = useState<string[]>([])
  const onClips = useCallback((names: string[]) => setClipNames(names), [])
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)

  const frames = moveFrames(move)
  const t = Math.min(frame * FRAME, moveLength(move))
  const phase = phaseAt(move, t)
  const half = fighterHalfExtents(json, player)
  const hb = move.hitbox

  // Play: advance a frame per 60th of a second, looping.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += now - last
      last = now
      const steps = Math.floor(acc / (1000 * FRAME))
      if (steps) {
        acc -= steps * 1000 * FRAME
        setFrame((f) => (f + steps) % (frames + 1))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, frames])

  const setMove = (next: Json) => {
    const own = node.status === 'inherited' ? overrideNode(json, node) : json
    save(editPack(pack, setIn(own, node.path, next) as PackJson))
  }
  const setHitbox = (next: Hitbox) => setMove({ ...move, hitbox: next })

  const clip = resolveFighterClip('attack', move.clip, (model?.clips ?? {}) as ClipMap, new Set(clipNames))
  const clipName = move.clip === undefined ? '' : typeof move.clip === 'string' ? move.clip : move.clip.name

  const boxes: PreviewBox[] = [
    { center: [0, 0, 0], half, color: '#40d070', solid: false },
    {
      center: [hb.forward, hb.up, 0],
      half: [hb.halfX, hb.halfY, hb.halfZ],
      color: phase === 'active' ? '#ff3030' : '#805050',
      solid: phase === 'active',
    },
  ]

  const total = moveLength(move) || 1
  const pct = (s: number) => `${(s / total) * 100}%`
  const cancel = move.cancelFrom ?? move.startup + move.active

  return (
    <div data-testid="move-tools">
      <ModelPreview
        model={preview}
        color={String(player.color ?? '#888888')}
        scale={1}
        clip={clip}
        time={t}
        floorY={-half[1]}
        boxes={boxes}
        onClips={onClips}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
        <button style={ui.button} onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <input
          aria-label="Frame"
          type="range"
          min={0}
          max={frames}
          value={Math.min(frame, frames)}
          onChange={(e) => {
            setPlaying(false)
            setFrame(Number(e.target.value))
          }}
          style={{ flex: 1 }}
        />
        <span data-testid="frame-label" style={{ width: '170px', color: PHASE_COLOR[phase] }}>
          frame {Math.min(frame, frames)}/{frames} · {phase}
        </span>
      </div>
      {/* Phases: startup, active, recovery, with the cancel point and the cursor. */}
      <div style={{ position: 'relative', height: '14px', display: 'flex', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
        <div style={{ width: pct(move.startup), background: PHASE_COLOR.startup }} title={`startup ${move.startup}s`} />
        <div style={{ width: pct(move.active), background: PHASE_COLOR.active }} title={`active ${move.active}s`} />
        <div style={{ width: pct(move.recovery), background: PHASE_COLOR.recovery }} title={`recovery ${move.recovery}s`} />
        <div style={{ position: 'absolute', left: pct(cancel), top: 0, bottom: 0, width: '2px', background: '#fff' }} title="cancel window opens" />
        <div style={{ position: 'absolute', left: pct(t), top: 0, bottom: 0, width: '2px', background: '#000' }} />
      </div>
      <div style={{ display: 'flex', gap: '12px', color: '#889', marginTop: '2px' }}>
        <span style={{ color: PHASE_COLOR.startup }}>startup {Math.round(move.startup / FRAME)}f</span>
        <span style={{ color: PHASE_COLOR.active }}>active {Math.round(move.active / FRAME)}f</span>
        <span style={{ color: PHASE_COLOR.recovery }}>recovery {Math.round(move.recovery / FRAME)}f</span>
        <span>│ cancel from {Math.round(cancel / FRAME)}f</span>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={sectionHeading}>HITBOX (DRAG TO MOVE, CORNER TO RESIZE)</div>
          <HitboxEditor hitbox={hb} hurt={half} active={phase === 'active'} onChange={setHitbox} />
          {(!!move.projectile || !!move.throw) && (
            <div data-testid="move-fires" style={{ color: '#d9b44a', maxWidth: '300px', marginTop: '4px' }}>
              {move.projectile
                ? `Fires the projectile "${(move.projectile as { id?: string }).id}" as the active frames begin; this hitbox hits nothing.`
                : 'Throws the held enemy as the active frames begin; this hitbox hits nothing.'}
            </div>
          )}
        </div>
        <div>
          <div style={sectionHeading}>ANIMATION</div>
          <select
            aria-label="Move clip"
            style={ui.input}
            value={clipName}
            onChange={(e) => {
              const next = { ...move } as Json
              if (!e.target.value) delete next.clip
              else next.clip = typeof move.clip === 'object' ? { ...move.clip, name: e.target.value } : e.target.value
              setMove(next)
            }}
          >
            <option value="">(the model's attack clip)</option>
            {clipName && !clipNames.includes(clipName) && <option value={clipName}>{clipName} (missing)</option>}
            {clipNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div style={{ color: '#667', marginTop: '4px', maxWidth: '220px' }}>
            Playing: {clip ? `${clip.name} ×${clip.speed}` : 'no clip'}. Set the speed in the form below.
          </div>
        </div>
      </div>
    </div>
  )
}

const PX = 70 // pixels per world unit
const W = 300
const H = 210
const OX = 90 // the body's centre, in the view
const OY = 110

/** A side view (forward is right, up is up) of the hurtbox and hitbox; drag the hitbox or its corner. */
const HitboxEditor = ({
  hitbox,
  hurt,
  active,
  onChange,
}: {
  hitbox: Hitbox
  hurt: [number, number, number]
  active: boolean
  onChange: (h: Hitbox) => void
}) => {
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; start: Hitbox } | null>(null)
  const begin = (mode: 'move' | 'resize') => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, start: hitbox }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / PX
    const dy = -(e.clientY - d.y) / PX
    if (d.mode === 'move') onChange({ ...d.start, forward: round(d.start.forward + dx), up: round(d.start.up + dy) })
    else
      onChange({
        ...d.start,
        halfX: Math.max(0.05, round(d.start.halfX + dx / 2)),
        halfY: Math.max(0.05, round(d.start.halfY + dy / 2)),
        forward: round(d.start.forward + dx / 2),
        up: round(d.start.up + dy / 2),
      })
  }
  const x = (u: number) => OX + u * PX
  const y = (u: number) => OY - u * PX
  const left = x(hitbox.forward - hitbox.halfX)
  const top = y(hitbox.up + hitbox.halfY)
  const w = hitbox.halfX * 2 * PX
  const h = hitbox.halfY * 2 * PX
  return (
    <svg
      data-testid="hitbox-editor"
      width={W}
      height={H}
      style={{ background: '#0b0e18', borderRadius: '4px', touchAction: 'none' }}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
    >
      <line x1={0} x2={W} y1={y(-hurt[1])} y2={y(-hurt[1])} stroke="#2c3346" />
      <rect x={x(-hurt[0])} y={y(hurt[1])} width={hurt[0] * 2 * PX} height={hurt[1] * 2 * PX} fill="none" stroke="#40d070" />
      <text x={x(0)} y={y(hurt[1]) - 4} fill="#40d070" fontSize="10" textAnchor="middle">
        body
      </text>
      <rect
        data-testid="hitbox-rect"
        x={left}
        y={top}
        width={w}
        height={h}
        fill={active ? 'rgba(255,48,48,0.4)' : 'rgba(255,48,48,0.15)'}
        stroke="#ff5050"
        style={{ cursor: 'move' }}
        onPointerDown={begin('move')}
      />
      <rect
        data-testid="hitbox-corner"
        x={left + w - 5}
        y={top - 5}
        width={10}
        height={10}
        fill="#ff5050"
        style={{ cursor: 'nesw-resize' }}
        onPointerDown={begin('resize')}
      />
      <text x={6} y={H - 8} fill="#889" fontSize="10">
        forward {hitbox.forward} · up {hitbox.up} · size {round(hitbox.halfX * 2)}×{round(hitbox.halfY * 2)}
      </text>
    </svg>
  )
}
