import { describe, expect, it } from 'vitest'
import { createFrameStats, FRAME_BUDGET_MS, recordFrame, summarize } from './perf'

describe('frame stats', () => {
  it('is empty before any frame', () => {
    expect(summarize(createFrameStats())).toMatchObject({ frames: 0, avg: 0, fps: 0 })
  })

  it('summarizes recent frames: average, 95th percentile, worst and over-budget share', () => {
    const s = createFrameStats(20)
    for (let i = 0; i < 19; i++) recordFrame(s, 10)
    recordFrame(s, 50)
    const r = summarize(s)
    expect(r.frames).toBe(20)
    expect(r.avg).toBe(12)
    expect(r.p95).toBe(10)
    expect(r.worst).toBe(50)
    expect(r.fps).toBeCloseTo(1000 / 12)
    expect(r.overBudget).toBe(0.05)
  })

  it('keeps only the newest frames', () => {
    const s = createFrameStats(4)
    for (const ms of [100, 100, 5, 5, 5, 5]) recordFrame(s, ms)
    expect(summarize(s)).toMatchObject({ frames: 4, avg: 5, worst: 5, overBudget: 0 })
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.67, 1)
  })
})
