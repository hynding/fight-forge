import { useRef, useState, useEffect, createRef, RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics, RapierRigidBody } from '@react-three/rapier'
import { PerspectiveCamera } from '@react-three/drei'
import { DirectionalLight, Vector3 } from 'three'
import { Player } from './Player'
import { Enemy } from './Enemy'
import { Stage } from './Stage'
import { CameraRig } from './CameraRig'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { CombatSystem } from './CombatSystem'
import { isFrozen, useGameStore } from '../store/gameStore'
import { getConfig, getLevels } from '../content/active'
import { SimLoopDriver } from '../sim/SimLoopDriver'
import type { FighterRuntime } from '../sim/fighter'
import { createStageView } from '../sim/stage'
import { levelLength } from '../sim/level'
import { Pickups } from './Pickups'
import { LevelDirector } from './LevelDirector'
import { Backdrop } from './Backdrop'
import { Props } from './Props'

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
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const playerPositionRef = useRef(new Vector3(...config.player.spawnPosition))
  const lightRef = useRef<DirectionalLight>(null)
  // Horizontal camera state, shared by the camera, the player's screen bounds, and the spawner.
  const [view] = useState(() => createStageView(config.player.spawnPosition[0]))
  // Every fighter's live runtime (moves, reactions, facing) by name, for combat.
  // Fighters register themselves; mutable, so no re-render sits between a move and its hit.
  const [runtimes] = useState(() => new Map<string, FighterRuntime>())

  const enemies = useGameStore((state) => state.enemies)
  const frozen = useGameStore(isFrozen)
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
      <Canvas shadows dpr={[1, 2]}>
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

        <SimLoopDriver>
        <CameraRig
          view={view}
          stageLength={STAGE_LENGTH}
          playerPositionRef={playerPositionRef}
          lightRef={lightRef}
        />
        <LevelDirector
          level={LEVEL}
          stageLength={STAGE_LENGTH}
          view={view}
          playerPositionRef={playerPositionRef}
        />
        <Physics gravity={config.physics.gravity} paused={frozen}>
          <Stage length={STAGE_LENGTH} theme={THEME} />
          <Props />
          <Player
            ref={playerRef}
            runtimes={runtimes}
            view={view}
          />

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
                playerPositionRef={playerPositionRef}
                enemyRefs={enemyRefs.current}
                stageLength={STAGE_LENGTH}
                view={view}
                runtimes={runtimes}
              />
            )
          })}

          <CombatSystem
            playerRef={playerRef}
            runtimes={runtimes}
            enemyRefs={enemyRefs.current}
            playerPositionRef={playerPositionRef}
          />
          <Pickups playerPositionRef={playerPositionRef} />
        </Physics>
        </SimLoopDriver>
      </Canvas>
      <HUD />
      <PauseMenu />
    </>
  )
}
