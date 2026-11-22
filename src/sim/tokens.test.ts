import { describe, expect, it } from 'vitest'
import { SIM_STEP } from './loop'
import {
  EMPTY_POOL,
  cancelRequest,
  forget,
  holdsToken,
  releaseToken,
  requestToken,
  type TokenPool,
  NO_POOLS,
  cancelRequests,
  forgetAll,
  poolFor,
  releaseTokens,
  requestTokenFor,
  tokenTarget,
  type TokenPools,
} from './tokens'
import {
  canClaimAttackSlot,
  createAttackSlotTimer,
  startAttackSlotHold,
  stepAttackSlot,
} from './timers'

describe('token pool', () => {
  it('grants up to max tokens', () => {
    let pool: TokenPool = EMPTY_POOL
    let r = requestToken(pool, 'a', 2)
    expect(r.granted).toBe(true)
    pool = r.pool
    r = requestToken(pool, 'b', 2)
    expect(r.granted).toBe(true)
    pool = r.pool
    r = requestToken(pool, 'c', 2)
    expect(r.granted).toBe(false)
    expect(r.pool.waiting).toEqual(['c'])
  })

  it('is idempotent for a holder', () => {
    const { pool } = requestToken(EMPTY_POOL, 'a', 1)
    const again = requestToken(pool, 'a', 1)
    expect(again.granted).toBe(true)
    expect(again.pool).toBe(pool)
  })

  it('gives a freed token to the longest-waiting enemy, not whoever asks first', () => {
    let pool = requestToken(EMPTY_POOL, 'a', 1).pool
    pool = requestToken(pool, 'b', 1).pool // waits
    pool = requestToken(pool, 'c', 1).pool // waits behind b
    pool = releaseToken(pool, 'a')
    expect(requestToken(pool, 'c', 1).granted).toBe(false)
    const b = requestToken(pool, 'b', 1)
    expect(b.granted).toBe(true)
    expect(holdsToken(b.pool, 'b')).toBe(true)
  })

  it('drops cancelled and forgotten enemies from the queue', () => {
    let pool = requestToken(EMPTY_POOL, 'a', 1).pool
    pool = requestToken(pool, 'b', 1).pool
    pool = cancelRequest(pool, 'b')
    expect(pool.waiting).toEqual([])
    pool = forget(pool, 'a')
    expect(pool).toEqual({ holders: [], waiting: [] })
  })

  it('takes turns fairly: three enemies all attack, none starves', () => {
    // The enemies ask in the same fixed order every step (like sim systems),
    // which would always favour "a" without the queue.
    const SLOT = { attackSlotDuration: 1, attackSlotRecovery: 1 }
    const ids = ['a', 'b', 'c']
    const timers = Object.fromEntries(ids.map((id) => [id, createAttackSlotTimer()]))
    const turns: Record<string, number> = { a: 0, b: 0, c: 0 }
    let pool: TokenPool = EMPTY_POOL

    for (let step = 0; step < 12 / SIM_STEP; step++) {
      for (const id of ids) {
        const t = timers[id]
        if (stepAttackSlot(t, SIM_STEP, SLOT)) pool = releaseToken(pool, id)
        if (holdsToken(pool, id) || !canClaimAttackSlot(t)) continue
        const r = requestToken(pool, id, 1)
        pool = r.pool
        if (r.granted) {
          startAttackSlotHold(t, SLOT)
          turns[id]++
        }
      }
    }
    expect(Math.min(...Object.values(turns))).toBeGreaterThanOrEqual(3)
    expect(Math.max(...Object.values(turns)) - Math.min(...Object.values(turns))).toBeLessThanOrEqual(1)
  })
})

describe('token pools per player', () => {
  it('gives each player their own attackers', () => {
    let pools: TokenPools = NO_POOLS
    const ask = (id: string, target: string) => {
      const r = requestTokenFor(pools, target, id, 1)
      pools = r.pools
      return r.granted
    }
    expect(ask('a', 'p1')).toBe(true)
    expect(ask('b', 'p1')).toBe(false)
    expect(ask('c', 'p2')).toBe(true)
    expect(tokenTarget(pools, 'a')).toBe('p1')
    expect(tokenTarget(pools, 'c')).toBe('p2')
    expect(tokenTarget(pools, 'b')).toBeNull()
    expect(poolFor(pools, 'p1').waiting).toEqual(['b'])
  })

  it('waits in one queue at a time, and forgets an enemy everywhere', () => {
    let pools: TokenPools = requestTokenFor(NO_POOLS, 'p1', 'a', 1).pools
    pools = requestTokenFor(pools, 'p1', 'b', 1).pools
    pools = requestTokenFor(pools, 'p2', 'c', 1).pools
    // b gives up on p1 and goes for p2, where c holds the token: it waits there.
    pools = requestTokenFor(pools, 'p2', 'b', 1).pools
    expect(poolFor(pools, 'p1').waiting).toEqual([])
    expect(poolFor(pools, 'p2').waiting).toEqual(['b'])
    pools = releaseTokens(pools, 'c')
    expect(requestTokenFor(pools, 'p2', 'b', 1).granted).toBe(true)
    pools = cancelRequests(pools, 'b')
    expect(poolFor(pools, 'p2').waiting).toEqual([])
    pools = forgetAll(pools, 'a')
    expect(poolFor(pools, 'p1')).toEqual({ holders: [], waiting: [] })
  })

  it('returns the same pools when nothing changes', () => {
    const pools = requestTokenFor(NO_POOLS, 'p1', 'a', 1).pools
    expect(cancelRequests(pools, 'zz')).toBe(pools)
    expect(releaseTokens(pools, 'zz')).toBe(pools)
  })
})
