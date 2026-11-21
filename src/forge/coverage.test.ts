import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { packSchema } from '../content/schemas'
import { fieldKind } from './schemaForm'

/** Every place in a schema the Forge's generated form can't edit (it would fall back to raw JSON). */
const uneditable = (schema: z.ZodTypeAny, path: string, out: string[]) => {
  const f = fieldKind(schema)
  switch (f.kind) {
    case 'unknown':
      out.push(path)
      break
    case 'object':
      for (const [k, s] of Object.entries(f.shape)) uneditable(s, `${path}.${k}`, out)
      break
    case 'tuple':
      f.items.forEach((s, i) => uneditable(s, `${path}[${i}]`, out))
      break
    case 'array':
      uneditable(f.item, `${path}[]`, out)
      break
    case 'record':
      uneditable(f.value, `${path}{}`, out)
      break
    case 'union':
      f.options.forEach((s, i) => uneditable(s, `${path}|${i}`, out))
      break
    case 'tagged':
      for (const [tag, s] of f.options) uneditable(s, `${path}<${String(tag)}>`, out)
      break
  }
  return out
}

describe('forge coverage', () => {
  it('can edit every field of a pack with a form (none fall back to raw JSON)', () => {
    expect(uneditable(packSchema, 'pack', [])).toEqual([])
  })
})
