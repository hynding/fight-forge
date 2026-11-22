// The attack-token pool: at most `max` enemies may attack a player at once.
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

/**
 * One pool per player an enemy can attack, by player id (`p1`, `p2`): the
 * attacker limit applies to each player. An enemy waits for, or holds, a
 * token against one player at a time.
 */
export type TokenPools = Readonly<Record<string, TokenPool>>

export const NO_POOLS: TokenPools = {}

/** The pool for attacks on `target`. */
export const poolFor = (pools: TokenPools, target: string): TokenPool => pools[target] ?? EMPTY_POOL

/** The player an enemy holds a token against, or null. */
export const tokenTarget = (pools: TokenPools, id: string): string | null =>
  Object.keys(pools).find((target) => pools[target].holders.includes(id)) ?? null

const mapPools = (pools: TokenPools, f: (pool: TokenPool, target: string) => TokenPool): TokenPools => {
  let changed = false
  const next: Record<string, TokenPool> = {}
  for (const target of Object.keys(pools)) {
    next[target] = f(pools[target], target)
    if (next[target] !== pools[target]) changed = true
  }
  return changed ? next : pools
}

/** Asks for a token against `target`, leaving any other player's queue. */
export const requestTokenFor = (pools: TokenPools, target: string, id: string, max: number): { pools: TokenPools; granted: boolean } => {
  const others = mapPools(pools, (pool, t) => (t === target ? pool : cancelRequest(pool, id)))
  const r = requestToken(poolFor(others, target), id, max)
  return { pools: r.pool === poolFor(others, target) && target in others ? others : { ...others, [target]: r.pool }, granted: r.granted }
}

/** Leaves every queue. */
export const cancelRequests = (pools: TokenPools, id: string): TokenPools => mapPools(pools, (pool) => cancelRequest(pool, id))

/** Gives back any token held. */
export const releaseTokens = (pools: TokenPools, id: string): TokenPools => mapPools(pools, (pool) => releaseToken(pool, id))

/** Drops an enemy from every pool (death, despawn). */
export const forgetAll = (pools: TokenPools, id: string): TokenPools => mapPools(pools, (pool) => forget(pool, id))
