import { useEffect, useRef, useState, type RefObject } from 'react'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { SYSTEM_ORDER } from '../sim/loop'
import { useSimLoop, useSimSystem } from '../sim/simContext'
import { createLevelRuntime, placeItems, stepLevel, type Level, type SpawnDef } from '../sim/level'
import { offscreenSpawn, type StageView } from '../sim/stage'

const { spawning: SPAWN, stage: STAGE, enemyTypes: ENEMY_TYPES } = DEFAULT_CONFIG
// The "GO →" prompt hides once the player has walked this far past the
// released lock, or after this long.
const GO_PROMPT_DISTANCE = 4
const GO_PROMPT_SECONDS = 4

// The timestamp prefix keeps ids unique even if a dev hot reload resets the counter.
let enemyIdCounter = 0
const nextEnemyId = () => `enemy-${Date.now().toString(36)}-${++enemyIdCounter}`

interface LevelDirectorProps {
  level: Level
  stageLength: number
  view: StageView
  playerPositionRef: RefObject<Vector3>
}

/**
 * Runs the level script as a sim system: spawns waves when the player reaches
 * triggers, locks and releases the camera, and completes the level at the
 * goal. The pure logic is `stepLevel` in src/sim/level.ts.
 */
export const LevelDirector = ({
  level,
  stageLength,
  view,
  playerPositionRef,
}: LevelDirectorProps) => {
  const [rt] = useState(() => createLevelRuntime(level))
  const go = useRef<{ fromX: number; timeLeft: number } | null>(null)
  // The loop starts at 0 with each level (the scene remounts), so its time is the level time.
  const loop = useSimLoop()

  const spawn = (def: SpawnDef, triggerX: number): string => {
    const depth = def.depth ?? Math.random()
    let at: { x: number; z: number }
    if (def.from === 'placed') {
      at = {
        x: Math.min(stageLength, Math.max(0, triggerX + (def.x ?? 0))),
        z: STAGE.depthBand[0] + depth * (STAGE.depthBand[1] - STAGE.depthBand[0]),
      }
    } else {
      // Off the left edge at the stage start would be on screen; come from the right.
      const leftOffStage = view.cameraX - view.halfWidth - SPAWN.offscreenMargin < 0
      const side = def.from === 'left' && !leftOffStage ? -1 : 1
      at = offscreenSpawn(view, side, SPAWN.offscreenMargin, depth, stageLength, STAGE.depthBand)
    }
    const id = nextEnemyId()
    const maxHealth = ENEMY_TYPES[def.type].maxHealth
    useGameStore.getState().spawnEnemy({
      id,
      type: def.type,
      health: maxHealth,
      maxHealth,
      position: [at.x, SPAWN.height, at.z],
    })
    return id
  }

  useEffect(() => {
    const store = useGameStore.getState()
    store.setLevelProgress({ levelName: level.name })
    // Level items lie on the stage from the start (stable ids, so a re-run doesn't duplicate them).
    const [z0, z1] = STAGE.depthBand
    for (const it of placeItems(level)) {
      store.spawnPickup({ id: it.id, pickup: it.pickup, x: it.x, z: z0 + it.depth * (z1 - z0) })
    }
  }, [level])

  useSimSystem('level', SYSTEM_ORDER.level, (dt) => {
    const player = playerPositionRef.current
    if (!player) return
    const store = useGameStore.getState()
    const alive = new Set(store.enemies.map((e) => e.id))

    const events = stepLevel(
      rt,
      { playerX: player.x, cameraX: view.cameraX, isAlive: (id) => alive.has(id), spawn },
      dt
    )

    for (const e of events) {
      if (e.kind === 'lock') {
        view.lockX = e.x
        go.current = null
        store.setLevelProgress({ goPrompt: false })
      } else if (e.kind === 'unlock') {
        view.lockX = null
        go.current = { fromX: player.x, timeLeft: GO_PROMPT_SECONDS }
        store.setLevelProgress({ goPrompt: true })
      } else if (e.kind === 'complete') {
        store.completeLevel(loop.time)
        return
      }
    }

    // HUD wave label: the locked fight's progress, if any.
    const locked = rt.encounters.find((enc) => enc.trigger.lock)
    const label = locked ? `Wave ${locked.waveIndex + 1}/${locked.trigger.waves.length}` : null
    if (label !== store.levelProgress.waveLabel) store.setLevelProgress({ waveLabel: label })

    if (go.current) {
      go.current.timeLeft -= dt
      if (go.current.timeLeft <= 0 || player.x > go.current.fromX + GO_PROMPT_DISTANCE) {
        go.current = null
        store.setLevelProgress({ goPrompt: false })
      }
    }
  })

  return null
}
