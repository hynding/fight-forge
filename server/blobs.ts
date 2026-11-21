// Pack files (bundles, covers) stored by their SHA-256, on disk or in memory.
// Behind this interface so they can move to object storage later.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

export interface Blobs {
  put(hash: string, bytes: Uint8Array): Promise<void>
  get(hash: string): Promise<Uint8Array | null>
}

const HASH = /^[0-9a-f]{64}$/

export const diskBlobs = (dir: string): Blobs => {
  const path = (hash: string) => {
    if (!HASH.test(hash)) throw new Error('bad blob hash')
    return join(dir, hash.slice(0, 2), hash)
  }
  return {
    async put(hash, bytes) {
      const p = path(hash)
      try {
        await access(p)
        return // Same content, already stored.
      } catch {
        await mkdir(join(dir, hash.slice(0, 2)), { recursive: true })
        await writeFile(p, bytes)
      }
    },
    async get(hash) {
      try {
        return new Uint8Array(await readFile(path(hash)))
      } catch {
        return null
      }
    },
  }
}

export const memoryBlobs = (): Blobs => {
  const m = new Map<string, Uint8Array>()
  return {
    put: async (hash, bytes) => void m.set(hash, bytes),
    get: async (hash) => m.get(hash) ?? null,
  }
}
