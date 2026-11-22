import { useRef, useState, useEffect, createRef, RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { PerspectiveCamera } from '@react-three/drei'
import { DirectionalLight } from 'three'
import { Player } from './Player'
import { Enemy } from './Enemy'
import { Stage } from './Stage'
import { CameraRig } from './CameraRig'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { CombatSystem } from './CombatSystem'
import { GrabSystem } from './GrabSystem'
import { Projectiles } from './Projectiles'
import { HeldWeapons } from './HeldWeapons'
import { createProjectileWorld } from '../sim/projectiles'
import { PerfMonitor } from './PerfMonitor'
import { HealthBars } from './HealthBars'
import { ModelBudgetDriver } from './ModelBudgetDriver'
import { createModelBudget } from '../sim/budget'
import { isFrozen, useGameStore } from '../store/gameStore'
import { getConfig, getLevels } from '../content/active'
import { SimLoopDriver } from '../sim/SimLoopDriver'
import type { FighterRuntime } from '../sim/fighter'
import { createStageView } from '../sim/stage'
import { levelLength } from '../sim/level'
import { Pickups } from './Pickups'
import { LevelDirector } from './LevelDirector'
import type { SummonRequest } from '../sim/boss'
import { Backdrop } from './Backdrop'
import { Props } from './Props'
import { sceneProbe } from '../sim/probe'
import { duckMusic, playMusic, stopMusic } from '../audio/engine'
import { ScenePhysics } from './ScenePhysics'
import { Effects } from './Effects'
import { InputManager } from '../input/InputManager'
import { ModelBudgetContext, useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { createScenePlayers, fighterBody, playerRef } from './scenePlayers'
import { playerId } from '../sim/players'

/** The `input` sim system: samples the scene's input first in every step. */
const InputSystem = ({ input }: { input: InputManager }) => {
  useSimSystem('input', SYSTEM_ORDER.input, () => input.step())
  return null
}

export const GameScene = () => {
  // The scene remounts for each level (keyed on gameId), so read the level once.
  const config = getConfig()
  const [LEVEL] = useState(() => {
    const { sandbox, levelIndex } = useGameStore.getState()
    if (sandbox) return sandbox
    const levels = getLevels()
    return levels[levelIndex] ?? levels[0]
  })
  const STAGE_LENGTH = levelLength(LEVEL)
  // The registry guarantees the level's theme exists.
  const THEME = config.themes[LEVEL.theme]
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const slots = useGameStore((state) => state.players.map((p) => p.slot).join(','))
  // Every player's body and position, by player id.
  const [players] = useState(() =>
    createScenePlayers(
      useGameStore.getState().players.map((p) => p.slot),
      config.player.spawnPosition
    )
  )
  const lightRef = useRef<DirectionalLight>(null)
  // Horizontal camera state, shared by the camera, the player's screen bounds, and the spawner.
  const [view] = useState(() => createStageView(config.player.spawnPosition[0]))
  // Every fighter's live runtime (moves, reactions, facing) by name, for combat.
  // Fighters register themselves; mutable, so no re-render sits between a move and its hit.
  const [runtimes] = useState(() => new Map<string, FighterRuntime>())
  const [modelBudget] = useState(createModelBudget)
  // Boss phase summons, spawned by the LevelDirector.
  const [summons] = useState<SummonRequest[]>(() => [])
  // Projectiles in flight (knives, barrels): scene state, like the summons.
  const [projectiles] = useState(createProjectileWorld)
  // Keyboard (and later mouse and gamepad) input, sampled once per sim step.
  const [input] = useState(() => new InputManager())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => input.attach(window, () => canvasRef.current), [input])

  const enemies = useGameStore((state) => state.enemies)
  const frozen = useGameStore(isFrozen)
  const editing = useGameStore((state) => state.editing)
  // Let the Forge (open over a paused playtest) see where the player stands.
  useEffect(() => {
    sceneProbe.playerX = () => players.positions.get(playerId(1))?.x ?? null
    sceneProbe.runtime = (name) => runtimes.get(name) ?? null
    sceneProbe.projectiles = () => projectiles.list
    sceneProbe.position = (name) => {
      const body = fighterBody(players, enemyRefs.current, name)
      if (!body) return null
      const t = body.translation()
      return { x: t.x, z: t.z }
    }
    return () => {
      sceneProbe.playerX = () => null
      sceneProbe.runtime = () => null
      sceneProbe.position = () => null
      sceneProbe.projectiles = () => []
    }
  }, [runtimes, projectiles, players])
  // The level's music loops while the scene is up, quieter while it's frozen (paused, results, editing).
  useEffect(() => {
    playMusic(LEVEL.music)
    return () => {
      stopMusic()
      duckMusic(false)
    }
  }, [LEVEL])
  useEffect(() => duckMusic(frozen), [frozen])
  // Clean up enemy refs when enemies are removed
  useEffect(() => {
    const currentEnemyIds = new Set(enemies.map((e) => e.id))
    const refsToDelete: string[] = []

    enemyRefs.current.forEach((_, id) => {
      if (!currentEnemyIds.has(id)) {
        refsToDelete.push(id)
      }
    })

    refsToDelete.forEach((id) => {
      enemyRefs.current.delete(id)
    })
  }, [enemies])

  return (
    <>
      {/* While the Forge is open over the paused scene, stop drawing it. */}
      <Canvas ref={canvasRef} shadows dpr={[1, 2]} frameloop={editing ? 'never' : 'always'}>
        {/* Without an explicit background the canvas is transparent over a white page,
            which made the white HUD text unreadable. */}
        <color attach="background" args={[THEME.sky]} />
        {THEME.fog && <fog attach="fog" args={[THEME.fog.color, THEME.fog.near, THEME.fog.far]} />}
        <PerspectiveCamera makeDefault fov={config.camera.fov} />

        <ambientLight intensity={THEME.lighting.ambient} />
        <directionalLight
          ref={lightRef}
          position={[10, 20, 10]}
          color={THEME.lighting.sun.color}
          intensity={THEME.lighting.sun.intensity}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <hemisphereLight
          args={[THEME.lighting.hemisphere.sky, THEME.lighting.hemisphere.ground, THEME.lighting.hemisphere.intensity]}
        />
        <Backdrop theme={THEME} length={STAGE_LENGTH} view={view} />

        <ModelBudgetContext.Provider value={modelBudget}>
        <SimLoopDriver>
        <InputSystem input={input} />
        <CameraRig
          view={view}
          stageLength={STAGE_LENGTH}
          players={players}
          lightRef={lightRef}
        />
        <LevelDirector
          level={LEVEL}
          stageLength={STAGE_LENGTH}
          view={view}
          players={players}
          summons={summons}
        />
        <ScenePhysics gravity={config.physics.gravity} frozen={frozen}>
          <Stage length={STAGE_LENGTH} theme={THEME} />
          <Props />
          {slots.split(',').map(Number).map((slot) => (
            <Player
              key={slot}
              ref={playerRef(players, playerId(slot))}
              slot={slot}
              runtimes={runtimes}
              input={input}
              view={view}
            />
          ))}

          {enemies.map((enemy) => {
            if (!enemyRefs.current.has(enemy.id)) {
              enemyRefs.current.set(enemy.id, createRef<RapierRigidBody>())
            }

            return (
              <Enemy
                key={enemy.id}
                ref={enemyRefs.current.get(enemy.id)!}
                id={enemy.id}
                type={enemy.type}
                position={enemy.position}
                players={players}
                enemyRefs={enemyRefs.current}
                stageLength={STAGE_LENGTH}
                view={view}
                runtimes={runtimes}
                summons={summons}
              />
            )
          })}

          <CombatSystem players={players} runtimes={runtimes} enemyRefs={enemyRefs.current} />
          <GrabSystem players={players} runtimes={runtimes} enemyRefs={enemyRefs.current} />
          <HeldWeapons players={players} runtimes={runtimes} enemyRefs={enemyRefs.current} />
          <Projectiles world={projectiles} players={players} runtimes={runtimes} enemyRefs={enemyRefs.current} stageLength={STAGE_LENGTH} />
          <Pickups players={players} />
        </ScenePhysics>
        <Effects />
        <HealthBars enemyRefs={enemyRefs.current} />
        <PerfMonitor fighters={() => runtimes.size} />
        <ModelBudgetDriver players={players} enemyRefs={enemyRefs.current} />
        </SimLoopDriver>
        </ModelBudgetContext.Provider>
      </Canvas>
      <HUD input={input} />
      <PauseMenu input={input} />
    </>
  )
}
