// Reading zod schemas to build editor forms: what kind of field a schema is,
// and a sensible starting value for a new one. Pure TS; the React form lives
// in SchemaForm.tsx.

import { z } from 'zod'

export type FieldKind =
  | { kind: 'object'; shape: Record<string, z.ZodTypeAny> }
  | { kind: 'number'; int: boolean; min?: number; max?: number }
  | { kind: 'string' }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: string[] }
  | { kind: 'literal'; value: unknown }
  | { kind: 'tuple'; items: z.ZodTypeAny[] }
  | { kind: 'array'; item: z.ZodTypeAny }
  | { kind: 'record'; key: z.ZodTypeAny; value: z.ZodTypeAny; keys?: string[] }
  | { kind: 'union'; options: z.ZodTypeAny[] }
  | { kind: 'tagged'; tag: string; options: Map<string, z.ZodTypeAny> }
  | { kind: 'unknown' }

/** Strip wrappers that don't change the field: optional, default, refinements, nullable. */
export const unwrap = (schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } => {
  let s = schema
  let optional = false
  for (;;) {
    if (s instanceof z.ZodOptional) {
      optional = true
      s = s.unwrap()
    } else if (s instanceof z.ZodDefault) {
      optional = true
      s = s.removeDefault()
    } else if (s instanceof z.ZodEffects) s = s.innerType()
    else if (s instanceof z.ZodNullable) s = s.unwrap()
    else return { inner: s, optional }
  }
}

const isColor = (s: z.ZodString) =>
  s._def.checks.some((c) => c.kind === 'regex' && c.regex.source.includes('0-9a-fA-F]{6}'))

export const fieldKind = (schema: z.ZodTypeAny): FieldKind => {
  const { inner: s } = unwrap(schema)
  if (s instanceof z.ZodObject) return { kind: 'object', shape: s.shape as Record<string, z.ZodTypeAny> }
  if (s instanceof z.ZodNumber) {
    let min: number | undefined
    let max: number | undefined
    let int = false
    for (const c of s._def.checks) {
      if (c.kind === 'int') int = true
      if (c.kind === 'min') min = c.value
      if (c.kind === 'max') max = c.value
    }
    return { kind: 'number', int, min, max }
  }
  if (s instanceof z.ZodString) return isColor(s) ? { kind: 'color' } : { kind: 'string' }
  if (s instanceof z.ZodBoolean) return { kind: 'boolean' }
  if (s instanceof z.ZodEnum) return { kind: 'enum', options: [...s.options] as string[] }
  if (s instanceof z.ZodLiteral) return { kind: 'literal', value: s.value }
  if (s instanceof z.ZodTuple) return { kind: 'tuple', items: s.items as z.ZodTypeAny[] }
  if (s instanceof z.ZodArray) return { kind: 'array', item: s.element }
  if (s instanceof z.ZodRecord) {
    const key = s.keySchema as z.ZodTypeAny
    const k = unwrap(key).inner
    return { kind: 'record', key, value: s.valueSchema, keys: k instanceof z.ZodEnum ? ([...k.options] as string[]) : undefined }
  }
  if (s instanceof z.ZodDiscriminatedUnion)
    return { kind: 'tagged', tag: s.discriminator, options: s.optionsMap as Map<string, z.ZodTypeAny> }
  if (s instanceof z.ZodUnion) return { kind: 'union', options: s.options as z.ZodTypeAny[] }
  return { kind: 'unknown' }
}

/** A starting value for a new field of this schema: minimal but shaped right. */
export const defaultFor = (schema: z.ZodTypeAny): unknown => {
  if (schema instanceof z.ZodDefault) return schema._def.defaultValue()
  const f = fieldKind(schema)
  switch (f.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(f.shape)) if (!unwrap(v).optional) out[k] = defaultFor(v)
      return out
    }
    case 'number':
      return f.min !== undefined && f.min > 0 ? f.min : f.int ? (f.min ?? 0) : Math.max(f.min ?? 0, 1)
    case 'string':
      return 'new'
    case 'color':
      return '#888888'
    case 'boolean':
      return false
    case 'enum':
      return f.options[0]
    case 'literal':
      return f.value
    case 'tuple':
      return f.items.map(defaultFor)
    case 'array':
      return []
    case 'record':
      return {}
    case 'union':
      return defaultFor(f.options[0])
    case 'tagged': {
      const [first] = f.options.values()
      return defaultFor(first)
    }
    default:
      return null
  }
}

/** Field labels: `walkSpeed` → "Walk speed", `colliderHalfExtents` → "Collider half extents". */
export const labelFor = (key: string): string => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}
