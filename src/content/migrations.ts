// Pack format versions. Every pack says which `schemaVersion` it was written
// for; older packs are upgraded step by step before validation, so packs made
// with an earlier build keep loading. When the schema changes incompatibly:
// bump SCHEMA_VERSION in schemas.ts and add `MIGRATIONS[old]` that rewrites a
// pack from `old` to `old + 1` (pure JSON in, JSON out), with a test.

import { SCHEMA_VERSION } from './schemas'

type Json = Record<string, unknown>

/** `MIGRATIONS[n]` upgrades a pack from schemaVersion n to n + 1. */
export type MigrationTable = Readonly<Record<number, (pack: Json) => Json>>

export const MIGRATIONS: MigrationTable = {}

export type MigrationResult = { ok: true; value: unknown } | { ok: false; message: string }

/**
 * Upgrade a pack to `target`. Anything that isn't an object with a whole-number
 * `schemaVersion` is passed through for the schema to report.
 */
export const migratePack = (
  input: unknown,
  migrations: MigrationTable = MIGRATIONS,
  target: number = SCHEMA_VERSION
): MigrationResult => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: true, value: input }
  let pack = input as Json
  const from = pack.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from)) return { ok: true, value: input }
  if (from > target)
    return {
      ok: false,
      message: `made for schema version ${from}, but this build reads up to ${target}; update the game to load it`,
    }
  for (let v = from; v < target; v++) {
    const step = migrations[v]
    if (!step) return { ok: false, message: `no migration from schema version ${v} to ${v + 1}` }
    pack = { ...step(pack), schemaVersion: v + 1 }
  }
  return { ok: true, value: pack }
}
