import { useState } from 'react'
import { fighterHalfExtents } from '../../forge/fighter'
import { getIn } from '../../forge/paths'
import { DEFAULT_FROM, firingMoves } from '../../forge/projectile'
import { nodeValue, type TreeNode } from '../../forge/tree'
import { baseContent, type WorkspacePack } from '../../forge/workspace'
import { flightPath, type ProjectileDef } from '../../sim/projectiles'
import { sectionHeading, ui } from './ui'

const W = 560
const H = 200
const LEFT = 50 // the thrower's centre, in the view
const FLOOR = H - 26
const round = (n: number) => Math.round(n * 100) / 100

interface Props {
  pack: WorkspacePack
  node: TreeNode
}

/**
 * The PROJECTILE card: a side view of its flight with nothing in the way
 * (thrown by the player's body, from the first move that fires it), with its
 * hitbox drawn along the path, plus its range, time in the air and the
 * moves that fire it. Edits go through the generated form below.
 */
export const ProjectileTools = ({ pack, node }: Props) => {
  const json = pack.json
  const def = nodeValue(json, node) as ProjectileDef | undefined
  const id = String(node.path[1])
  const users = firingMoves(json, id)
  const [user, setUser] = useState(0)
  if (!def || !def.hitbox || !Array.isArray(def.size)) return null

  const player = (getIn(json, ['settings', 'player']) ?? baseContent().settings.player) as Record<string, unknown>
  const half = fighterHalfExtents(json, player)
  const from = users[Math.min(user, users.length - 1)]?.from ?? DEFAULT_FROM
  // Fired from the body's centre plus `from`; the body stands on the floor.
  const height = Math.max(0, half[1] + from[1])
  const path = flightPath(def, height)
  // Fit the flight (and the body) in the view.
  const span = Math.max(2, path.range + from[0] + def.hitbox.halfX + half[0])
  const tall = Math.max(2.5, height + path.apex + def.hitbox.halfY + 0.3)
  const px = Math.min(60, (W - LEFT - 20) / span, (FLOOR - 10) / tall)
  const sx = (u: number) => LEFT + u * px
  const sy = (u: number) => FLOOR - u * px
  const launchX = from[0]
  // The hitbox every ~0.15 s along the path.
  const every = Math.max(1, Math.round(path.points.length / 8))
  const boxes = path.points.filter((_, i) => i % every === 0 || i === path.points.length - 1)

  return (
    <div data-testid="projectile-tools">
      <div style={sectionHeading}>PROJECTILE</div>
      <svg data-testid="projectile-path" width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: `${W}px`, background: '#0b0e18', borderRadius: '4px' }}>
        <line x1={0} x2={W} y1={FLOOR} y2={FLOOR} stroke="#2c3346" strokeWidth={2} />
        {/* The thrower's body. */}
        <rect x={sx(-half[0])} y={sy(half[1] * 2)} width={half[0] * 2 * px} height={half[1] * 2 * px} fill="none" stroke="#40d070" />
        <text x={sx(0)} y={sy(half[1] * 2) - 4} fill="#40d070" fontSize="10" textAnchor="middle">
          thrower
        </text>
        {boxes.map((pt, i) => (
          <rect
            key={i}
            x={sx(launchX + pt.x - def.hitbox.halfX)}
            y={sy(height + pt.y + def.hitbox.halfY)}
            width={def.hitbox.halfX * 2 * px}
            height={def.hitbox.halfY * 2 * px}
            fill="rgba(255,48,48,0.08)"
            stroke="rgba(255,80,80,0.5)"
          />
        ))}
        <polyline
          points={path.points.map((pt) => `${sx(launchX + pt.x)},${sy(height + pt.y)}`).join(' ')}
          fill="none"
          stroke={def.color}
          strokeWidth={2}
          strokeDasharray="5 3"
        />
        <circle cx={sx(launchX)} cy={sy(height)} r={3} fill={def.color} />
        <text x={sx(launchX + path.range)} y={sy(height + (path.points.at(-1)?.y ?? 0)) - 8} fill="#dde" fontSize="11" textAnchor="middle">
          {path.end === 'landed' ? 'lands' : 'vanishes'}
        </text>
        <text x={6} y={H - 8} fill="#889" fontSize="11">
          range {round(path.range)} · {round(path.time)} s in the air · rises {round(path.apex)} · {def.damage} damage
          {def.pierce ? ` · through ${def.pierce + 1} targets` : ''}
        </text>
      </svg>
      <div style={{ color: '#aab', marginTop: '4px' }}>
        {users.length === 0 ? (
          <span style={{ color: '#667' }}>No move fires it yet: give a move a projectile with this id ({id}).</span>
        ) : (
          <label>
            Fired by{' '}
            <select aria-label="Fired by" style={ui.input} value={Math.min(user, users.length - 1)} onChange={(e) => setUser(Number(e.target.value))}>
              {users.map((u, i) => (
                <option key={u.move} value={i}>
                  {u.move}
                </option>
              ))}
            </select>{' '}
            <span style={{ color: '#667' }}>(the view uses where this move fires it from)</span>
          </label>
        )}
      </div>
    </div>
  )
}
