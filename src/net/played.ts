// Which version of each published pack this browser last played, so the
// gallery can mark packs that have been updated since.

const KEY = 'fight-forge-played'

/** True when `a` is a later version than `b` ("1.10.0" > "1.9.3"). */
export const isNewerVersion = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

export type Played = Record<string, string>

/** Updated since it was last played here (never played isn't "updated"). */
export const isUpdated = (played: Played, id: string, version: string): boolean => played[id] !== undefined && isNewerVersion(version, played[id])

export const loadPlayed = (): Played => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as Played) : {}
  } catch {
    return {}
  }
}

export const recordPlayed = (id: string, version: string): Played => {
  const played = { ...loadPlayed(), [id]: version }
  try {
    localStorage.setItem(KEY, JSON.stringify(played))
  } catch {
    // Private mode or storage full: the badge just won't show.
  }
  return played
}
