import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { createFrameStats, recordFrame, summarize, type PerfSnapshot } from '../sim/perf'
import { sceneProbe } from '../sim/probe'

/**
 * Inside the Canvas: records every rendered frame's time and, four times a
 * second, publishes a snapshot (frame times plus the renderer's draw calls,
 * triangles, geometries and textures) on `sceneProbe.perf` for the HUD's
 * debug overlay and headless stress checks.
 */
export const PerfMonitor = ({ fighters }: { fighters: () => number }) => {
  const gl = useThree((s) => s.gl)
  const stats = useRef(createFrameStats())
  const latest = useRef<PerfSnapshot | null>(null)
  const sinceSnapshot = useRef(0)

  useEffect(() => {
    sceneProbe.perf = () => latest.current
    // three resets its counters after drawing shadow maps, so they'd go
    // uncounted; reset them here instead, once per frame, to count everything.
    gl.info.autoReset = false
    return () => {
      sceneProbe.perf = () => null
      gl.info.autoReset = true
    }
  }, [gl])

  useFrame((_, delta) => {
    recordFrame(stats.current, delta * 1000)
    sinceSnapshot.current += delta
    const { render, memory } = gl.info
    // The counts so far are the last frame's (shadow maps and the scene).
    const counts = { calls: render.calls, triangles: render.triangles }
    gl.info.reset()
    if (sinceSnapshot.current < 0.25) return
    sinceSnapshot.current = 0
    latest.current = {
      ...summarize(stats.current),
      drawCalls: counts.calls,
      triangles: counts.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      fighters: fighters(),
    }
  })

  return null
}
