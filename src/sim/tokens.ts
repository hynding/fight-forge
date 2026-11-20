// The attack-token pool: at most `max` enemies may attack the player at once.
// Enemies that want to attack queue up; a free token goes to the one that has
// waited longest, so nobody is starved. Immutable (it lives in the zustand
// store, and UIs subscribe to who holds a token).

export interface TokenPool {
  /** Enemies holding a token, in the order they got it. */
  holders: readonly string[]
  /** Enemies waiting for a token, longest-waiting first. */
  waiting: readonly string[]
}

export const EMPTY_POOL: TokenPool = { holders: [], waiting: [] }

export const holdsToken = (pool: TokenPool, id: string): boolean => pool.holders.includes(id)

/**
 * Asks for a token. Joins the queue if needed; gets a token if one is free and
 * this enemy is among the first waiters (one per free token).
 */
export const requestToken = (
  pool: TokenPool,
  id: string,
  max: number
): { pool: TokenPool; granted: boolean } => {
  if (pool.holders.includes(id)) return { pool, granted: true }
  const waiting = pool.waiting.includes(id) ? pool.waiting : [...pool.waiting, id]
  const free = max - pool.holders.length
  const place = waiting.indexOf(id)
  if (free > 0 && place < free) {
    return {
      pool: { holders: [...pool.holders, id], waiting: waiting.filter((w) => w !== id) },
      granted: true,
    }
  }
  return { pool: waiting === pool.waiting ? pool : { ...pool, waiting }, granted: false }
}

/** Leaves the queue (no longer wants to attack). */
export const cancelRequest = (pool: TokenPool, id: string): TokenPool =>
  pool.waiting.includes(id) ? { ...pool, waiting: pool.waiting.filter((w) => w !== id) } : pool

/** Gives the token back (no-op if not held). */
export const releaseToken = (pool: TokenPool, id: string): TokenPool =>
  pool.holders.includes(id) ? { ...pool, holders: pool.holders.filter((h) => h !== id) } : pool

/** Drops an enemy entirely (death, despawn). */
export const forget = (pool: TokenPool, id: string): TokenPool => cancelRequest(releaseToken(pool, id), id)
