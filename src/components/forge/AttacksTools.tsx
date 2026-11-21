import type { AttackDef, AttackRange } from '../../sim/attacks'
import { attackChances } from '../../sim/attacks'
import { attackRows, attackWarnings, withAttacks } from '../../forge/attacks'
import { sectionHeading, ui } from './ui'

type Json = Record<string, unknown>

const RANGES: AttackRange[] = ['near', 'far', 'any']
const pct = (n: number) => (n > 0 ? `${Math.round(n * 100)}%` : '–')

interface Props {
  enemy: Json
  /** The move an enemy uses when its type names none (`settings.enemy.attackMove`). */
  defaultMove: string
  /** Every move id, for the dropdowns. */
  moves: string[]
  /** The type's AI archetype's far reach, if it has one. */
  farReach: number | undefined
  /** Saves the enemy type with its new attacks. */
  onChange: (enemy: Json) => void
}

/**
 * The ATTACKS card on enemy types: a row per attack (move, range, weight,
 * cooldown) and each attack's chance of being picked at near and far range.
 */
export const AttacksTools = ({ enemy, defaultMove, moves, farReach, onChange }: Props) => {
  const rows = attackRows(enemy, defaultMove)
  const near = attackChances(rows, 'near')
  const far = attackChances(rows, 'far')
  const set = (next: AttackDef[]) => onChange(withAttacks(enemy, next))
  const edit = (i: number, patch: Partial<AttackDef>) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)))
  const cell = { padding: '2px 6px' }

  return (
    <div data-testid="attacks-tools">
      <div style={sectionHeading}>ATTACKS</div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#8890a8', textAlign: 'left' }}>
            <th style={cell}>Move</th>
            <th style={cell}>Range</th>
            <th style={cell}>Weight</th>
            <th style={cell}>Cooldown (s)</th>
            <th style={cell} title="Chance of each attack when the enemy is close">
              Near
            </th>
            <th style={cell} title="Chance of each attack from far reach">
              Far
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-attack-row={i}>
              <td style={cell}>
                <select aria-label={`Attack ${i + 1} move`} style={ui.input} value={r.move} onChange={(e) => edit(i, { move: e.target.value })}>
                  {(moves.includes(r.move) ? moves : [r.move, ...moves]).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </td>
              <td style={cell}>
                <select aria-label={`Attack ${i + 1} range`} style={ui.input} value={r.range} onChange={(e) => edit(i, { range: e.target.value as AttackRange })}>
                  {RANGES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </td>
              <td style={cell}>
                <input
                  aria-label={`Attack ${i + 1} weight`}
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="1"
                  style={{ ...ui.input, width: '56px' }}
                  value={r.weight ?? ''}
                  onChange={(e) => edit(i, { weight: num(e.target.value) })}
                />
              </td>
              <td style={cell}>
                <input
                  aria-label={`Attack ${i + 1} cooldown`}
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="0"
                  style={{ ...ui.input, width: '56px' }}
                  value={r.cooldown ?? ''}
                  onChange={(e) => edit(i, { cooldown: num(e.target.value) })}
                />
              </td>
              <td style={cell} data-chance="near">
                {pct(near[i])}
              </td>
              <td style={cell} data-chance="far">
                {pct(far[i])}
              </td>
              <td style={cell}>
                <button style={ui.button} disabled={rows.length <= 1} title="Remove this attack" onClick={() => set(rows.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ ...ui.button, marginTop: '4px' }} onClick={() => set([...rows, { move: rows[rows.length - 1]?.move ?? defaultMove, range: 'near' }])}>
        + attack
      </button>
      {attackWarnings(rows, farReach).map((w) => (
        <div key={w} style={{ color: '#ffcc66', fontSize: '11px' }}>
          ⚠ {w}
        </div>
      ))}
    </div>
  )
}
