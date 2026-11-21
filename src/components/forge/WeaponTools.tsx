import { useState } from 'react'
import { describeErrors, installBundle } from '../../content/library'
import { effectiveMoves, fighterHalfExtents } from '../../forge/fighter'
import { getIn, setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { addWeaponPickup, setThrow, throwProjectile, weaponPickups, weaponSandboxLevel, weaponSummary } from '../../forge/weapon'
import { baseContent, editPack, exportBundle, type PackJson, type WorkspacePack } from '../../forge/workspace'
import type { Moveset } from '../../sim/moveset'
import type { WeaponDef } from '../../sim/weapons'
import { useGameStore } from '../../store/gameStore'
import { MovesetTools } from './MovesetTools'
import { sectionHeading, ui } from './ui'

interface Props {
  pack: WorkspacePack
  node: TreeNode
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
  /** The pack has validation errors (the sandbox can't load it). */
  invalid: boolean
}

const W = 220
const H = 200
const PX = 60
const FLOOR = H - 16

/** A side view of the weapon in the player's hand (or overhead), to scale. */
const InHand = ({ weapon, half }: { weapon: WeaponDef; half: [number, number, number] }) => {
  const [w, h] = weapon.model.size
  const cx = W / 2 - 20
  const bodyTop = FLOOR - half[1] * 2 * PX
  const centreY = FLOOR - half[1] * PX
  const shape = weapon.model.shape
  // Length along the hand: the size's height; thickness: its width.
  const len = (shape === 'sphere' ? w : h) * PX
  const thick = Math.max(3, w * PX)
  const overhead = weapon.hold === 'overhead'
  const x = overhead ? cx : cx + half[0] * PX + 10
  const y = overhead ? bodyTop - (shape === 'sphere' ? len / 2 : thick / 2) - 2 : centreY
  const angle = overhead ? 90 : 36
  return (
    <svg data-testid="weapon-preview" width={W} height={H} style={{ background: '#0b0e18', borderRadius: '4px', flex: 'none' }}>
      <line x1={0} x2={W} y1={FLOOR} y2={FLOOR} stroke="#2c3346" strokeWidth={2} />
      <rect x={cx - half[0] * PX} y={bodyTop} width={half[0] * 2 * PX} height={half[1] * 2 * PX} fill="none" stroke="#40d070" />
      <text x={cx} y={bodyTop - (overhead ? len + 12 : 6)} fill="#40d070" fontSize="10" textAnchor="middle">
        player
      </text>
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        {shape === 'sphere' ? (
          <circle r={len / 2} fill={weapon.model.color} stroke="#ffd27a" />
        ) : (
          <rect x={-thick / 2} y={-len / 2} width={thick} height={len} rx={shape === 'cylinder' ? thick / 2 : 1} fill={weapon.model.color} stroke="#ffd27a" />
        )}
      </g>
    </svg>
  )
}

/**
 * The WEAPON card: the weapon in hand, what it does in a line, its moves (the
 * moveset table, tried before the player's own rows), what throwing it fires,
 * the pickups that put it on the floor, and a sandbox fight holding it.
 */
export const WeaponTools = ({ pack, node, save, onError, invalid }: Props) => {
  const json = pack.json
  const id = String(node.path[1])
  const weapon = nodeValue(json, node) as WeaponDef | undefined
  const [busy, setBusy] = useState(false)
  const startSandbox = useGameStore((s) => s.startSandbox)
  if (!weapon || !weapon.model || !Array.isArray(weapon.moveset)) return null

  const own = (): PackJson => (node.status === 'inherited' ? overrideNode(json, node) : json)
  const setWeapon = (next: WeaponDef) => save(editPack(pack, setIn(own(), node.path, next) as PackJson))
  const player = (getIn(json, ['settings', 'player']) ?? baseContent().settings.player) as Record<string, unknown>
  const half = fighterHalfExtents(json, player)
  const projectiles = Object.keys({ ...baseContent().projectiles, ...((getIn(json, ['projectiles']) ?? {}) as object) })
  const thrown = throwProjectile(json, weapon)
  const pickups = weaponPickups(json, id)

  const fight = async () => {
    setBusy(true)
    const r = await installBundle(await exportBundle(pack))
    setBusy(false)
    if (!r.ok) return onError(describeErrors(r.errors))
    startSandbox(weaponSandboxLevel(), { packId: pack.id }, { weapon: id })
  }

  return (
    <div data-testid="weapon-tools">
      <div style={sectionHeading}>WEAPON</div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <InHand weapon={weapon} half={half} />
        <div style={{ minWidth: '260px', flex: 1 }}>
          <div data-testid="weapon-summary" style={{ color: '#dde', marginBottom: '8px' }}>
            {weaponSummary(weapon)}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <label>
              Throwing it fires{' '}
              <select
                aria-label="Thrown projectile"
                style={ui.input}
                value={thrown ?? ''}
                onChange={(e) => save(editPack(pack, setThrow(own(), id, e.target.value || null, !!weapon.throw?.returns)))}
              >
                <option value="">nothing (grab drops it)</option>
                {projectiles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>{' '}
            {thrown && (
              <label title="Lands as a pickup again where it stops">
                <input
                  type="checkbox"
                  aria-label="Lands again"
                  checked={!!weapon.throw?.returns}
                  onChange={(e) => save(editPack(pack, setThrow(own(), id, thrown, e.target.checked)))}
                />{' '}
                lands again
              </label>
            )}
          </div>
          <div style={{ marginBottom: '6px', color: '#aab' }}>
            {pickups.length ? (
              <>On the floor as {pickups.map((p) => `"${p}"`).join(', ')}: place it in a level, or as a prop's or enemy's drop.</>
            ) : (
              <>
                <span style={{ color: '#d9b44a' }}>No pickup puts it on the floor yet.</span>{' '}
                <button style={ui.button} onClick={() => save(editPack(pack, addWeaponPickup(json, id).json))}>
                  + Make a pickup for it
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              style={{ ...ui.button, borderColor: '#ff4444', color: invalid ? '#777' : '#ff8080' }}
              disabled={invalid || busy}
              title={invalid ? 'Fix the problems first' : undefined}
              onClick={fight}
            >
              ▶ Fight with it
            </button>
            <span style={{ color: '#667' }}>You start holding it, against a few enemies.</span>
          </div>
        </div>
      </div>
      {weapon.kind === 'heavy' && (
        <div style={{ color: '#667', marginTop: '6px' }}>A heavy weapon replaces the player's moves while held: only its own rows below work.</div>
      )}
      <MovesetTools moveset={weapon.moveset as Moveset} moves={Object.keys(effectiveMoves(json))} onChange={(moveset) => setWeapon({ ...weapon, moveset })} />
    </div>
  )
}
