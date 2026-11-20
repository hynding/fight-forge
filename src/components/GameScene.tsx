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
import { useGameStore } from '../store/gameStore'
import { DEFAULT_CONFIG } from '../config/defaults'
import { SimLoopDriver } from '../sim/SimLoopDriver'
import { useSimSystem } from '../sim/simContext'
import { SYSTEM_ORDER } from '../sim/loop'
import { createPlayerAttackState, stepIntervalClock } from '../sim/timers'
import { createStageView, offscreenSpawn, type StageView } from '../sim/stage'

const { spawning: SPAWN, enemyTypes: ENEMY_TYPES, stage: STAGE } = DEFAULT_CONFIG

// The timestamp prefix keeps ids unique even if a dev hot reload resets the counter.
let enemyIdCounter = 0
const nextEnemyId = () => `enemy-${Date.now().toString(36)}-${++enemyIdCounter}`

// Periodic spawner, as a sim system: frozen while paused or game over, and the
// clamped frame step means returning to a hidden tab can't pay out a burst.
// Enemies walk in from just off a screen edge (the right one when the left
// edge is the stage start).
const EnemySpawner = ({ view }: { view: StageView }) => {
  const spawnEnemy = useGameStore((state) => state.spawnEnemy)
  const clock = useRef({ elapsed: 0 })

  useSimSystem('spawner', SYSTEM_ORDER.spawner, (dt) => {
    if (!stepIntervalClock(clock.current, dt, SPAWN.interval)) return
    if (useGameStore.getState().enemies.length >= SPAWN.maxEnemies) return

    const randomType = SPAWN.types[Math.floor(Math.random() * SPAWN.types.length)]
    const leftIsOffStage = view.cameraX - view.halfWidth - SPAWN.offscreenMargin < 0
    const side = leftIsOffStage || Math.random() < 0.5 ? 1 : -1
    const at = offscreenSpawn(
      view,
      side,
      SPAWN.offscreenMargin,
      Math.random(),
      STAGE.length,
      STAGE.depthBand
    )

    spawnEnemy({
      id: nextEnemyId(),
      type: randomType,
      health: ENEMY_TYPES[randomType].maxHealth,
      maxHealth: ENEMY_TYPES[randomType].maxHealth,
      position: [at.x, SPAWN.height, at.z],
    })
  })

  return null
}

export const GameScene = () => {
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const playerPositionRef = useRef(new Vector3(...DEFAULT_CONFIG.player.spawnPosition))
  const lightRef = useRef<DirectionalLight>(null)
  const attackDirectionRef = useRef(new Vector3(1, 0, 0))
  // Horizontal camera state, shared by the camera, the player's screen bounds, and the spawner.
  const [view] = useState(() => createStageView(DEFAULT_CONFIG.player.spawnPosition[0]))
  // Mutable swing state shared by Player (writes) and CombatSystem (reads) inside
  // the fixed-step sim, so no React re-render sits between a swing and its hit.
  const [playerAttack] = useState(createPlayerAttackState)

  const enemies = useGameStore((state) => state.enemies)
  const spawnEnemy = useGameStore((state) => state.spawnEnemy)
  const isGameOver = useGameStore((state) => state.isGameOver)
  const isPaused = useGameStore((state) => state.isPaused)
  const hasSpawnedInitial = useRef(false)

  // Spawn initial enemies once
  useEffect(() => {
    if (hasSpawnedInitial.current) return
    hasSpawnedInitial.current = true

    const type = SPAWN.initialType
    SPAWN.initialPositions.forEach((pos) => {
      spawnEnemy({
        id: nextEnemyId(),
        type,
        health: ENEMY_TYPES[type].maxHealth,
        maxHealth: ENEMY_TYPES[type].maxHealth,
        position: [...pos],
      })
    })
  }, [spawnEnemy])

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
        <CameraRig view={view} playerPositionRef={playerPositionRef} lightRef={lightRef} />
        <EnemySpawner view={view} />
        <Physics gravity={DEFAULT_CONFIG.physics.gravity} paused={isPaused || isGameOver}>
          <Stage />
          <Player
            ref={playerRef}
            attack={playerAttack}
            attackDirectionRef={attackDirectionRef}
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
              />
            )
          })}

          <CombatSystem
            playerRef={playerRef}
            attack={playerAttack}
            attackDirectionRef={attackDirectionRef}
            enemyRefs={enemyRefs.current}
            playerPositionRef={playerPositionRef}
          />
        </Physics>
        </SimLoopDriver>
      </Canvas>
      <HUD />
      <PauseMenu />
    </>
  )
}
