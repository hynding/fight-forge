// The player's volume settings: per browser, like key remapping.

export interface Volumes {
  master: number
  music: number
  sfx: number
}

export const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.6, sfx: 0.9 }

const KEY = 'fight-forge-volume'
const clamp = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)

/** Stored volumes, with anything missing or broken replaced by the default. */
export const parseVolumes = (raw: unknown): Volumes => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Volumes, unknown>>
  return { master: clamp(o.master, DEFAULT_VOLUMES.master), music: clamp(o.music, DEFAULT_VOLUMES.music), sfx: clamp(o.sfx, DEFAULT_VOLUMES.sfx) }
}

export const loadVolumes = (): Volumes => {
  try {
    return parseVolumes(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    return { ...DEFAULT_VOLUMES }
  }
}

export const saveVolumes = (v: Volumes) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // Private mode: the setting lasts for this visit only.
  }
}
