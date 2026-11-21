// The player's controller comfort settings: per browser, like key remapping
// and volume. The pack sets the default dead zone; the player can change it.

export interface PadPrefs {
  /** Rumble on hits (where the controller can). */
  rumble: boolean
  /** The stick dead zone, or null for the pack's. */
  deadZone: number | null
}

export const DEFAULT_PAD_PREFS: PadPrefs = { rumble: true, deadZone: null }

const KEY = 'fight-forge-pad'

export const parsePadPrefs = (raw: unknown): PadPrefs => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const dz = o.deadZone
  return {
    rumble: typeof o.rumble === 'boolean' ? o.rumble : DEFAULT_PAD_PREFS.rumble,
    deadZone: typeof dz === 'number' && Number.isFinite(dz) ? Math.min(0.9, Math.max(0, dz)) : null,
  }
}

let cached: PadPrefs | null = null

export const loadPadPrefs = (): PadPrefs => {
  if (cached) return cached
  try {
    cached = parsePadPrefs(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    cached = { ...DEFAULT_PAD_PREFS }
  }
  return cached
}

export const savePadPrefs = (p: PadPrefs): void => {
  cached = parsePadPrefs(p)
  try {
    localStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    // Private mode: the setting lasts for this visit only.
  }
}
