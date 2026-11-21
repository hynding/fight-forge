// The player's control comfort settings: per browser, like key remapping and
// volume. The pack sets the default dead zone; the player can change it.

export interface ControlPrefs {
  /** Rumble on hits (where the controller can). */
  rumble: boolean
  /** The stick dead zone, or null for the pack's. */
  deadZone: number | null
  /** Block toggles on a press instead of being held. */
  toggleBlock: boolean
  /** Standing still, the fighter turns toward the mouse's side of the screen. */
  faceCursor: boolean
}

export const DEFAULT_CONTROL_PREFS: ControlPrefs = { rumble: true, deadZone: null, toggleBlock: false, faceCursor: false }

// Named for its first use (controllers); it holds every control preference.
const KEY = 'fight-forge-pad'

export const parseControlPrefs = (raw: unknown): ControlPrefs => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const dz = o.deadZone
  return {
    rumble: typeof o.rumble === 'boolean' ? o.rumble : DEFAULT_CONTROL_PREFS.rumble,
    deadZone: typeof dz === 'number' && Number.isFinite(dz) ? Math.min(0.9, Math.max(0, dz)) : null,
    toggleBlock: o.toggleBlock === true,
    faceCursor: o.faceCursor === true,
  }
}

let cached: ControlPrefs | null = null

export const loadControlPrefs = (): ControlPrefs => {
  if (cached) return cached
  try {
    cached = parseControlPrefs(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    cached = { ...DEFAULT_CONTROL_PREFS }
  }
  return cached
}

export const saveControlPrefs = (p: ControlPrefs): void => {
  cached = parseControlPrefs(p)
  try {
    localStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    // Private mode: the setting lasts for this visit only.
  }
}
