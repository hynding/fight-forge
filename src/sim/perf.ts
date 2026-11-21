// Frame-time statistics for the performance overlay and the stress check:
// a ring buffer of recent frame times with average, 95th percentile, worst
// and the share of frames over the budget. Pure TS.

/** One frame at 60 Hz, in milliseconds: the target for the game on a typical laptop. */
export const FRAME_BUDGET_MS = 1000 / 60

export interface FrameStats {
  /** Recent frame times (ms), oldest overwritten first. */
  times: Float64Array
  /** Next slot to write. */
  next: number
  /** Frames recorded (caps at the buffer size). */
  count: number
}

export const createFrameStats = (size = 240): FrameStats => ({ times: new Float64Array(size), next: 0, count: 0 })

export const recordFrame = (s: FrameStats, ms: number): void => {
  s.times[s.next] = ms
  s.next = (s.next + 1) % s.times.length
  s.count = Math.min(s.count + 1, s.times.length)
}

export interface FrameSummary {
  frames: number
  avg: number
  p95: number
  worst: number
  fps: number
  /** Fraction of frames longer than the budget. */
  overBudget: number
}

export const summarize = (s: FrameStats, budget = FRAME_BUDGET_MS): FrameSummary => {
  if (s.count === 0) return { frames: 0, avg: 0, p95: 0, worst: 0, fps: 0, overBudget: 0 }
  const t = Array.from(s.times.subarray(0, s.count)).sort((a, b) => a - b)
  const sum = t.reduce((a, b) => a + b, 0)
  const avg = sum / t.length
  return {
    frames: t.length,
    avg,
    p95: t[Math.min(t.length - 1, Math.ceil(t.length * 0.95) - 1)],
    worst: t[t.length - 1],
    fps: avg > 0 ? 1000 / avg : 0,
    overBudget: t.filter((x) => x > budget + 1e-9).length / t.length,
  }
}

/** Renderer counters for the latest frame. */
export interface RenderCounts {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

/** What the overlay shows and headless checks read (`sceneProbe.perf`). */
export interface PerfSnapshot extends FrameSummary, RenderCounts {
  fighters: number
}
