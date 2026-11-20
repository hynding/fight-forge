import { useEffect, useState, type ReactNode } from 'react'
import type { z } from 'zod'
import { pathString, type Path } from '../../forge/paths'
import { defaultFor, fieldKind, labelFor, unwrap } from '../../forge/schemaForm'
import { ui } from './ui'


interface FieldProps {
  schema: z.ZodTypeAny
  value: unknown
  onChange: (next: unknown) => void
  /** Full path in the pack, for matching errors. */
  path: Path
  /** Error messages by path string. */
  errors: ReadonlyMap<string, string[]>
  readOnly: boolean
}

const Errors = ({ path, errors }: { path: Path; errors: ReadonlyMap<string, string[]> }) => {
  const list = errors.get(pathString(path))
  return list ? (
    <>
      {list.map((m) => (
        <div key={m} style={ui.error} data-testid="field-error">
          {m}
        </div>
      ))}
    </>
  ) : null
}

/** A number typed as text, so "1." or "-" can be on the way to a number. */
const NumberField = ({ value, onChange, readOnly, int, min, max, label }: {
  value: unknown
  onChange: (n: number) => void
  readOnly: boolean
  int: boolean
  min?: number
  max?: number
  label: string
}) => {
  const [text, setText] = useState(String(value ?? ''))
  useEffect(() => {
    if (Number(text) !== value) setText(String(value ?? ''))
    // Only resync when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      aria-label={label}
      style={{ ...ui.input, width: '80px' }}
      type="number"
      step={int ? 1 : 'any'}
      min={min}
      max={max}
      value={text}
      disabled={readOnly}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

const Row = ({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '3px 0' }}>
    <div style={{ width: '150px', flexShrink: 0, color: '#aab', paddingTop: '3px' }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    {actions}
  </div>
)

const Nested = ({ children }: { children: ReactNode }) => (
  <div style={{ borderLeft: '2px solid #2c3346', paddingLeft: '10px', margin: '2px 0 6px' }}>{children}</div>
)

/** An editor for any value, generated from its zod schema. */
export const Field = (props: FieldProps & { label?: string }): ReactNode => {
  const { schema, value, onChange, path, errors, readOnly, label = '' } = props
  const f = fieldKind(schema)
  const child = (s: z.ZodTypeAny, v: unknown, key: string | number, set: (n: unknown) => void, l = String(key)) => (
    <Field schema={s} value={v} onChange={set} path={[...path, key]} errors={errors} readOnly={readOnly} label={l} />
  )

  switch (f.kind) {
    case 'object': {
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      return (
        <div>
          <Errors path={path} errors={errors} />
          {Object.entries(f.shape).map(([key, s]) => {
            const optional = unwrap(s).optional
            const present = obj[key] !== undefined
            const set = (n: unknown) => onChange({ ...obj, [key]: n })
            const remove = () => {
              const next = { ...obj }
              delete next[key]
              onChange(next)
            }
            const nested = ['object', 'array', 'record', 'tagged'].includes(fieldKind(s).kind)
            const actions =
              optional && !readOnly ? (
                present ? (
                  <button style={ui.button} title="Remove (use the default)" onClick={remove}>
                    ×
                  </button>
                ) : (
                  <button style={ui.button} onClick={() => set(defaultFor(s))}>
                    + set
                  </button>
                )
              ) : undefined
            if (!present && optional)
              return (
                <Row key={key} label={labelFor(key)} actions={actions}>
                  <span style={{ color: '#667' }}>default</span>
                </Row>
              )
            if (nested)
              return (
                <div key={key}>
                  <Row label={labelFor(key)} actions={actions}>
                    {null}
                  </Row>
                  <Nested>{child(s, obj[key], key, set, labelFor(key))}</Nested>
                </div>
              )
            return (
              <Row key={key} label={labelFor(key)} actions={actions}>
                {child(s, obj[key], key, set, labelFor(key))}
              </Row>
            )
          })}
        </div>
      )
    }
    case 'number':
      return (
        <>
          <NumberField value={value} onChange={onChange} readOnly={readOnly} int={f.int} min={f.min} max={f.max} label={label} />
          <Errors path={path} errors={errors} />
        </>
      )
    case 'string':
      return (
        <>
          <input
            aria-label={label}
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
            value={typeof value === 'string' ? value : ''}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
          <Errors path={path} errors={errors} />
        </>
      )
    case 'color':
      return (
        <>
          <input
            aria-label={label}
            type="color"
            value={typeof value === 'string' ? value : '#888888'}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />{' '}
          <span style={{ color: '#889' }}>{String(value)}</span>
          <Errors path={path} errors={errors} />
        </>
      )
    case 'boolean':
      return (
        <input aria-label={label} type="checkbox" checked={value === true} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />
      )
    case 'enum':
      return (
        <>
          <select aria-label={label} style={ui.input} value={String(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
            {f.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <Errors path={path} errors={errors} />
        </>
      )
    case 'literal':
      return <span style={{ color: '#889' }}>{String(f.value)}</span>
    case 'tuple': {
      const arr = Array.isArray(value) ? value : []
      return (
        <>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {f.items.map((s, i) => (
              <div key={i}>{child(s, arr[i], i, (n) => onChange(f.items.map((_, j) => (j === i ? n : arr[j]))), `${label} ${'xyzw'[i] ?? i}`)}</div>
            ))}
          </div>
          <Errors path={path} errors={errors} />
        </>
      )
    }
    case 'array': {
      const arr = Array.isArray(value) ? value : []
      return (
        <div>
          <Errors path={path} errors={errors} />
          {arr.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <div style={{ color: '#667', width: '22px', paddingTop: '3px' }}>{i + 1}.</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {child(f.item, item, i, (n) => onChange(arr.map((x, j) => (j === i ? n : x))), `${label} ${i + 1}`)}
              </div>
              {!readOnly && (
                <button style={ui.button} title="Remove" onClick={() => onChange(arr.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button style={ui.button} onClick={() => onChange([...arr, defaultFor(f.item)])}>
              + add
            </button>
          )}
        </div>
      )
    }
    case 'record':
      return <RecordField {...props} f={f} />
    case 'union': {
      const at = Math.max(0, f.options.findIndex((o) => o.safeParse(value).success))
      return (
        <div>
          {!readOnly && f.options.length > 1 && (
            <select
              aria-label={`${label} form`}
              style={{ ...ui.input, marginBottom: '3px' }}
              value={at}
              onChange={(e) => onChange(defaultFor(f.options[Number(e.target.value)]))}
            >
              {f.options.map((o, i) => (
                <option key={i} value={i}>
                  {fieldKind(o).kind === 'object' ? 'detailed' : 'simple'}
                </option>
              ))}
            </select>
          )}
          <Field {...props} schema={f.options[at]} />
        </div>
      )
    }
    case 'tagged': {
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      const tag = String(obj[f.tag] ?? [...f.options.keys()][0])
      const option = f.options.get(tag)
      return (
        <div>
          <Row label={labelFor(f.tag)}>
            <select
              aria-label={`${label} ${f.tag}`}
              style={ui.input}
              value={tag}
              disabled={readOnly}
              onChange={(e) => onChange(defaultFor(f.options.get(e.target.value)!))}
            >
              {[...f.options.keys()].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Row>
          {option && <Field {...props} schema={option} />}
        </div>
      )
    }
    default:
      return <JsonField {...props} />
  }
}

const RecordField = (props: FieldProps & { label?: string; f: Extract<ReturnType<typeof fieldKind>, { kind: 'record' }> }) => {
  const { f, value, onChange, path, errors, readOnly } = props
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const [newKey, setNewKey] = useState('')
  const free = f.keys?.filter((k) => !(k in obj))
  const add = (key: string) => {
    if (!key || key in obj) return
    onChange({ ...obj, [key]: defaultFor(f.value) })
    setNewKey('')
  }
  return (
    <div>
      <Errors path={path} errors={errors} />
      {Object.entries(obj).map(([key, v]) => (
        <Row
          key={key}
          label={key}
          actions={
            !readOnly && (
              <button
                style={ui.button}
                title="Remove"
                onClick={() => {
                  const next = { ...obj }
                  delete next[key]
                  onChange(next)
                }}
              >
                ×
              </button>
            )
          }
        >
          <Field schema={f.value} value={v} onChange={(n) => onChange({ ...obj, [key]: n })} path={[...path, key]} errors={errors} readOnly={readOnly} label={key} />
        </Row>
      ))}
      {!readOnly &&
        (free ? (
          free.length > 0 && (
            <select aria-label="Add entry" style={ui.input} value="" onChange={(e) => add(e.target.value)}>
              <option value="">+ add…</option>
              {free.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )
        ) : (
          <span>
            <input aria-label="New entry name" style={{ ...ui.input, width: '120px' }} value={newKey} placeholder="name" onChange={(e) => setNewKey(e.target.value)} />{' '}
            <button style={ui.button} onClick={() => add(newKey)}>
              + add
            </button>
          </span>
        ))}
    </div>
  )
}

/** Fallback for schemas the form doesn't know: edit as JSON. */
const JsonField = ({ value, onChange, readOnly, path, errors }: FieldProps) => {
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [bad, setBad] = useState(false)
  return (
    <>
      <textarea
        style={{ ...ui.input, width: '100%', minHeight: '60px' }}
        value={text}
        disabled={readOnly}
        onChange={(e) => {
          setText(e.target.value)
          try {
            onChange(JSON.parse(e.target.value))
            setBad(false)
          } catch {
            setBad(true)
          }
        }}
      />
      {bad && <div style={ui.error}>not valid JSON yet</div>}
      <Errors path={path} errors={errors} />
    </>
  )
}
