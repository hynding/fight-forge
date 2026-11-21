import { addRow, actionFor, moveRow, PRESS_CHOICES, removeRow, setRow } from '../../forge/moveset'
import { DIRECTIONS, SITUATIONS, shadowedTriggers, triggerKey, type MoveTrigger, type Moveset } from '../../sim/moveset'
import { sectionHeading, ui } from './ui'

const SITUATION_NAMES: Record<string, string> = { ground: 'on the ground', air: 'in the air', running: 'running', blocking: 'blocking', grabbing: 'holding an enemy' }
const DIRECTION_NAMES: Record<string, string> = { toward: 'toward the enemy', away: 'away (behind)', up: 'up (into the screen)', down: 'down (out of it)' }

interface Props {
  moveset: Moveset
  moves: string[]
  /** Optional actions turned on in the pack but used by no row or branch. */
  unused?: string[]
  onChange: (moveset: Moveset) => void
}

const numberOrUndefined = (v: string): number | undefined => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))

/**
 * The MOVESET card: which move each press starts. Rows are tried top to
 * bottom and the first that matches wins, so specific rows (a direction, a
 * situation, a chord) go above the plain attack.
 */
export const MovesetTools = ({ moveset, moves, unused = [], onChange }: Props) => {
  const shadowed = new Set(shadowedTriggers(moveset))
  const row = (i: number, patch: Partial<MoveTrigger>) => onChange(setRow(moveset, i, { ...moveset[i], ...patch }))
  const cost = (i: number, key: 'health' | 'meter' | 'cooldown', value: string) => {
    const next = { ...moveset[i].cost, [key]: numberOrUndefined(value) }
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined))
    row(i, { cost: Object.keys(kept).length ? kept : undefined })
  }
  const select = (label: string, value: string, options: [string, string][], onPick: (v: string) => void) => (
    <select aria-label={label} style={ui.input} value={value} onChange={(e) => onPick(e.target.value)}>
      {options.map(([v, name]) => (
        <option key={v} value={v}>
          {name}
        </option>
      ))}
    </select>
  )

  return (
    <div data-testid="moveset-tools">
      <div style={sectionHeading}>MOVESET</div>
      <div style={{ color: '#667', marginBottom: '4px' }}>
        Which move each press starts. Rows are tried from the top; the first that fits wins. A chord is two buttons pressed together.
      </div>
      {moveset.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ color: '#667', width: '16px' }}>{i + 1}.</span>
          {select(`Row ${i + 1} press`, triggerKey(t), PRESS_CHOICES.map((p) => [p, p.replace('+', ' + ')]), (v) => row(i, { action: actionFor(v) }))}
          {select(`Row ${i + 1} situation`, t.when ?? 'ground', SITUATIONS.map((s) => [s, SITUATION_NAMES[s]]), (v) =>
            row(i, { when: v === 'ground' ? undefined : (v as MoveTrigger['when']) })
          )}
          {select(`Row ${i + 1} direction`, t.direction ?? '', [['', 'any direction'], ...DIRECTIONS.map((d): [string, string] => [d, DIRECTION_NAMES[d]])], (v) =>
            row(i, { direction: v === '' ? undefined : (v as MoveTrigger['direction']) })
          )}
          <span style={{ color: '#667' }}>→</span>
          {select(`Row ${i + 1} move`, t.move, (moves.includes(t.move) ? moves : [t.move, ...moves]).map((m) => [m, m]), (v) => row(i, { move: v }))}
          <label title="Health spent (never the last point)">
            ♥
            <input
              aria-label={`Row ${i + 1} health cost`}
              style={{ ...ui.input, width: '40px' }}
              type="number"
              min={1}
              step={1}
              value={t.cost?.health ?? ''}
              onChange={(e) => cost(i, 'health', e.target.value)}
            />
          </label>
          <label title="Meter spent (needs this much)">
            ⚡
            <input
              aria-label={`Row ${i + 1} meter cost`}
              style={{ ...ui.input, width: '40px' }}
              type="number"
              min={1}
              step={1}
              value={t.cost?.meter ?? ''}
              onChange={(e) => cost(i, 'meter', e.target.value)}
            />
          </label>
          <label title="Seconds before this row can fire again">
            ⏱
            <input
              aria-label={`Row ${i + 1} cooldown`}
              style={{ ...ui.input, width: '44px' }}
              type="number"
              min={0}
              step={0.1}
              value={t.cost?.cooldown ?? ''}
              onChange={(e) => cost(i, 'cooldown', e.target.value)}
            />
          </label>
          <button style={{ ...ui.button, padding: '0 4px' }} title="Higher" disabled={i === 0} onClick={() => onChange(moveRow(moveset, i, -1))}>
            ↑
          </button>
          <button
            style={{ ...ui.button, padding: '0 4px' }}
            title="Lower"
            disabled={i === moveset.length - 1}
            onClick={() => onChange(moveRow(moveset, i, 1))}
          >
            ↓
          </button>
          <button style={{ ...ui.button, padding: '0 4px' }} title="Remove" disabled={moveset.length === 1} onClick={() => onChange(removeRow(moveset, i))}>
            ×
          </button>
          {shadowed.has(i) && <span style={ui.error}>never used: a row above always matches first</span>}
        </div>
      ))}
      {unused.map((a) => (
        <div key={a} style={ui.error}>
          {a === 'grab'
            ? 'Grabs are on (Input settings) but no row is for "holding an enemy", so the player never grabs.'
            : `${a} is on (Input settings) but no row or combo branch uses it, so its button does nothing.`}
        </div>
      ))}
      <button style={ui.button} onClick={() => onChange(addRow(moveset, moves[0] ?? 'jab'))}>
        + row
      </button>
    </div>
  )
}
