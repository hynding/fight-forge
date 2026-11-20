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
import { DEFAULT_CONFIG } from '../config/defaults'
import { SimLoopDriver } from '../sim/SimLoopDriver'
import type { FighterRuntime } from '../sim/fighter'
import { createStageView } from '../sim/stage'
import { levelLength } from '../sim/level'
import { Pickups } from './Pickups'
import { LEVELS } from '../config/levels'
import { LevelDirector } from './LevelDirector'

export const GameScene = () => {
  // The scene remounts for each level (keyed on gameId), so read the level once.
  const [LEVEL] = useState(() => LEVELS[useGameStore.getState().levelIndex] ?? LEVELS[0])
  const STAGE_LENGTH = levelLength(LEVEL)
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const playerPositionRef = useRef(new Vector3(...DEFAULT_CONFIG.player.spawnPosition))
  const lightRef = useRef<DirectionalLight>(null)
  // Horizontal camera state, shared by the camera, the player's screen bounds, and the spawner.
  const [view] = useState(() => createStageView(DEFAULT_CONFIG.player.spawnPosition[0]))
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
        <color attach="background" args={['#1a1a2e']} />
        <PerspectiveCamera makeDefault fov={DEFAULT_CONFIG.camera.fov} />

        <ambientLight intensity={0.5} />
        <directionalLight
          ref={lightRef}
          position={[10, 20, 10]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <hemisphereLight args={['#b8c4ff', '#30303a', 0.4]} />

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
        <Physics gravity={DEFAULT_CONFIG.physics.gravity} paused={frozen}>
          <Stage length={STAGE_LENGTH} />
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
