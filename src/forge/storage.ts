// Saving the Forge workspace. IndexedDB in the browser (it stores asset bytes
// as they are); an in-memory store for tests and when IndexedDB is missing.

import type { WorkspacePack } from './workspace'

export interface PackStore {
  list(): Promise<WorkspacePack[]>
  put(pack: WorkspacePack): Promise<void>
  delete(id: string): Promise<void>
}

export const memoryStore = (initial: WorkspacePack[] = []): PackStore => {
  const packs = new Map(initial.map((p) => [p.id, p]))
  return {
    list: async () => [...packs.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    put: async (p) => void packs.set(p.id, p),
    delete: async (id) => void packs.delete(id),
  }
}

const DB = 'fight-forge-workspace'
const STORE = 'packs'

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

export const indexedDbStore = (): PackStore => {
  let db: Promise<IDBDatabase> | undefined
  const open = () => {
    if (!db) {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
      db = request(r)
    }
    return db
  }
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE)
  return {
    list: async () => ((await request((await tx('readonly')).getAll())) as WorkspacePack[]).sort((a, b) => b.updatedAt - a.updatedAt),
    put: async (p) => void (await request((await tx('readwrite')).put(p))),
    delete: async (id) => void (await request((await tx('readwrite')).delete(id))),
  }
}

/** The workspace store for this browser. */
let store: PackStore | undefined
export const workspaceStore = (): PackStore => {
  if (!store) store = typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore()
  return store
}

/** Where the creator was in the Forge, so coming back (from a playtest, or after a remix) lands on that pack and item. */
export const forgeFocus = { packId: null as string | null, nodeKey: 'pack' }
