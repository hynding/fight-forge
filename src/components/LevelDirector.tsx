import { useEffect, useRef, useState } from 'react'
import { leadX } from '../sim/players'
import { activePlayerIds, type ScenePlayers } from './scenePlayers'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimLoop, useSimSystem } from '../sim/simContext'
import { createLevelRuntime, placeItems, placeProps, stepLevel, type Level, type SpawnDef } from '../sim/level'
import { offscreenSpawn, type StageView } from '../sim/stage'
import { scaledHealth } from '../sim/rules'
import { coopHealthScale } from '../sim/coop'
import { playMusic, playSound } from '../audio/engine'
import { feelBossKo, feelBusy } from '../sim/feel'
import type { SummonRequest } from '../sim/boss'

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
  players: ScenePlayers
  /** Boss phase summons to spawn (taken from the queue as they come in). */
  summons: SummonRequest[]
}

/**
 * Runs the level script as a sim system: spawns waves when the leading player reaches
 * triggers, locks and releases the camera, and completes the level at the
 * goal, and spawns the helpers a boss summons as it changes phase. The pure
 * logic is `stepLevel` in src/sim/level.ts.
 */
export const LevelDirector = ({
  level,
  stageLength,
  view,
  players,
  summons,
}: LevelDirectorProps) => {
  const [rt] = useState(() => createLevelRuntime(level))
  const go = useRef<{ fromX: number; timeLeft: number } | null>(null)
  // The loop starts at 0 with each level (the scene remounts), so its time is the level time.
  const loop = useSimLoop()
  const feel = useFeel()
  // The level is won, waiting for the boss KO's slow motion to play out.
  const finishing = useRef(false)
  // Summoned helpers waiting out their `delay`.
  const pending = useRef<{ def: SpawnDef; x: number; timeLeft: number }[]>([])

  const spawn = (def: SpawnDef, triggerX: number): string => {
    const depth = def.depth ?? Math.random()
    let at: { x: number; z: number }
    if (def.from === 'placed') {
      at = {
        x: Math.min(stageLength, Math.max(0, triggerX + (def.x ?? 0))),
        z: getConfig().stage.depthBand[0] + depth * (getConfig().stage.depthBand[1] - getConfig().stage.depthBand[0]),
      }
    } else {
      // Off the left edge at the stage start would be on screen; come from the right.
      const leftOffStage = view.cameraX - view.halfWidth - getConfig().spawning.offscreenMargin < 0
      const side = def.from === 'left' && !leftOffStage ? -1 : 1
      at = offscreenSpawn(view, side, getConfig().spawning.offscreenMargin, depth, stageLength, getConfig().stage.depthBand)
    }
    const id = nextEnemyId()
    // Tougher with two players in (`coop.enemyHealth`), so waves stay the same.
    const crowd = coopHealthScale(activePlayerIds().length, getConfig().coop.enemyHealth)
    const maxHealth = scaledHealth(getConfig().enemyTypes[def.type].maxHealth, getConfig().rules.difficulty.enemyHealth * crowd)
    // The Forge can start a sandbox boss part-way down, at a later phase.
    const { sandbox, sandboxBossHealth } = useGameStore.getState()
    const start = sandbox && getConfig().enemyTypes[def.type].boss ? Math.max(1, Math.round(maxHealth * sandboxBossHealth)) : maxHealth
    useGameStore.getState().spawnEnemy({
      id,
      type: def.type,
      health: start,
      maxHealth,
      position: [at.x, getConfig().spawning.height, at.z],
    })
    return id
  }

  useEffect(() => {
    const store = useGameStore.getState()
    store.setLevelProgress({ levelName: level.name })
    // Level items lie on the stage from the start (stable ids, so a re-run doesn't duplicate them).
    const [z0, z1] = getConfig().stage.depthBand
    for (const it of placeItems(level)) {
      store.spawnPickup({ id: it.id, pickup: it.pickup, x: it.x, z: z0 + it.depth * (z1 - z0) })
    }
    // ...and so do its props, with their hit points.
    const propDefs = getConfig().props
    store.placeProps(
      placeProps(level).map((p) => ({
        id: p.id,
        prop: p.prop,
        x: p.x,
        y: p.y,
        z: z0 + p.depth * (z1 - z0),
        health: propDefs[p.prop]?.breakable?.health ?? Infinity,
      }))
    )
  }, [level])

  useSimSystem('level', SYSTEM_ORDER.level, (dt) => {
    // The level script follows the player furthest along.
    const x = leadX(activePlayerIds().flatMap((id) => players.positions.get(id)?.x ?? []))
    if (x === null) return
    const player = { x }
    const store = useGameStore.getState()
    const alive = new Set(store.enemies.map((e) => e.id))

    const events = stepLevel(
      rt,
      { playerX: player.x, cameraX: view.cameraX, isAlive: (id) => alive.has(id), spawn },
      dt
    )

    // Boss summons: each helper comes in after its delay, placed ones beside the boss.
    for (const req of summons.splice(0)) for (const def of req.enemies) pending.current.push({ def, x: req.x, timeLeft: def.delay ?? 0 })
    pending.current = pending.current.filter((p) => {
      p.timeLeft -= dt
      if (p.timeLeft > 1e-9) return true
      spawn(p.def, p.x)
      return false
    })

    for (const e of events) {
      if (e.kind === 'lock') {
        view.lockX = e.x
        go.current = null
        store.setLevelProgress({ goPrompt: false })
      } else if (e.kind === 'unlock') {
        view.lockX = null
        go.current = { fromX: player.x, timeLeft: GO_PROMPT_SECONDS }
        store.setLevelProgress({ goPrompt: true })
      } else if (e.kind === 'bossStart') {
        const def = getConfig().enemyTypes[e.trigger.enemy]
        const boss = def.boss!
        store.setLevelProgress({
          boss: { id: e.id, title: boss.title, subtitle: boss.subtitle, thresholds: boss.phases.map((p) => p.below), startedAt: loop.time },
          bossIntro: e.trigger.intro !== false,
          waveLabel: null,
        })
        if (e.trigger.music) playMusic(e.trigger.music)
      } else if (e.kind === 'bossDefeated') {
        const fight = store.levelProgress.boss
        store.setLevelProgress({ boss: null, bossTime: fight ? loop.time - fight.startedAt : null })
        feelBossKo(feel, getConfig().feel)
        if (e.endsLevel) {
          // The helpers go down with the boss.
          for (const enemy of useGameStore.getState().enemies) store.damageEnemy(enemy.id, enemy.health)
        } else playMusic(level.music)
      } else if (e.kind === 'complete') {
        finishing.current = true
      }
    }

    if (finishing.current) {
      // A boss KO plays out its slow motion before the results.
      if (feelBusy(feel)) return
      finishing.current = false
      useGameStore.getState().completeLevel(loop.time)
      playSound(getConfig().audio.clear)
      return
    }

    if (store.levelProgress.boss) return
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
