// Immutable get / set / delete at a path inside plain JSON, for the editor's
// forms. A path is a list of object keys and array indices.

export type Path = (string | number)[]

export const getIn = (value: unknown, path: Path): unknown => {
  let v = value
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<string | number, unknown>)[key]
  }
  return v
}

/** A copy of `value` with `path` set (missing objects and arrays are created). */
export const setIn = (value: unknown, path: Path, next: unknown): unknown => {
  if (path.length === 0) return next
  const [key, ...rest] = path
  if (typeof key === 'number') {
    const arr = Array.isArray(value) ? [...value] : []
    arr[key] = setIn(arr[key], rest, next)
    return arr
  }
  const obj = value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
  obj[key] = setIn(obj[key], rest, next)
  return obj
}

/** A copy of `value` without `path` (an array item is spliced out). */
export const deleteIn = (value: unknown, path: Path): unknown => {
  if (path.length === 0) return undefined
  const [key, ...rest] = path
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    if (typeof key !== 'number') return value
    if (rest.length === 0) return value.filter((_, i) => i !== key)
    const arr = [...value]
    arr[key] = deleteIn(arr[key], rest)
    return arr
  }
  const obj = { ...(value as Record<string, unknown>) }
  if (rest.length === 0) delete obj[key]
  else obj[key] = deleteIn(obj[key], rest)
  return obj
}

/** The registry's spelling of a path: `levels[0].segments[1].at`, `moves.jab.damage`. */
export const pathString = (path: Path): string =>
  path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '')
