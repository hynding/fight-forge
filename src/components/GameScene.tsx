import { useRef, useState, useEffect, createRef, RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics, RapierRigidBody } from '@react-three/rapier'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Player } from './Player'
import { Enemy } from './Enemy'
import { Arena } from './Arena'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { CombatSystem } from './CombatSystem'
import { useGameStore } from '../store/gameStore'
import { gameStep } from '../utils/gameTime'
import { DEFAULT_CONFIG } from '../config/defaults'

const _cameraTarget = new Vector3()

const { spawning: SPAWN, enemyTypes: ENEMY_TYPES, camera: CAMERA } = DEFAULT_CONFIG

// The timestamp prefix keeps ids unique even if a dev hot reload resets the counter.
let enemyIdCounter = 0
const nextEnemyId = () => `enemy-${Date.now().toString(36)}-${++enemyIdCounter}`

interface CameraRigProps {
  playerPositionRef: RefObject<Vector3>
  controlsRef: RefObject<OrbitControlsImpl>
}

const CameraRig = ({ playerPositionRef, controlsRef }: CameraRigProps) => {
  const { camera } = useThree()

  useFrame(() => {
    const p = playerPositionRef.current
    if (!p) return

    // After game over, OrbitControls rotation is enabled; stop forcing the camera
    // position so the player can actually orbit around the final scene.
    if (!useGameStore.getState().isGameOver) {
      camera.position.set(
        p.x + CAMERA.followOffset[0],
        p.y + CAMERA.followOffset[1],
        p.z + CAMERA.followOffset[2]
      )
    }

    if (controlsRef.current) {
      _cameraTarget.set(p.x, p.y, p.z)
      controlsRef.current.target.copy(_cameraTarget)
      controlsRef.current.update()
    }
  })

  return null
}

// Periodic spawner. Counts game time in useFrame: frozen while paused or game
// over, and the clamped step means returning to a hidden tab can't pay out a burst.
const EnemySpawner = () => {
  const spawnEnemy = useGameStore((state) => state.spawnEnemy)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    const { isPaused, isGameOver, enemies } = useGameStore.getState()
    if (isPaused || isGameOver) return

    elapsed.current += gameStep(delta)
    if (elapsed.current < SPAWN.interval) return
    elapsed.current -= SPAWN.interval
    if (enemies.length >= SPAWN.maxEnemies) return

    const angle = Math.random() * Math.PI * 2
    const randomType = SPAWN.types[Math.floor(Math.random() * SPAWN.types.length)]

    spawnEnemy({
      id: nextEnemyId(),
      type: randomType,
      health: ENEMY_TYPES[randomType].maxHealth,
      maxHealth: ENEMY_TYPES[randomType].maxHealth,
      position: [
        Math.cos(angle) * SPAWN.distance,
        SPAWN.height,
        Math.sin(angle) * SPAWN.distance,
      ],
    })
  })

  return null
}

export const GameScene = () => {
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const playerPositionRef = useRef(new Vector3(...DEFAULT_CONFIG.player.spawnPosition))
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const attackDirectionRef = useRef(new Vector3(0, 0, -1))
  // `playerAttacking` stays as React state because CombatSystem reads it as a prop
  // in `useFrame` and React's reconciler is what gets the new value into the closure.
  // The cost is one re-render of GameScene per attack (twice per swing — start and end),
  // which is negligible compared to the previous 60Hz cascade.
  const [playerAttacking, setPlayerAttacking] = useState(false)

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

  const handleAttackChange = (isAttacking: boolean, direction: Vector3) => {
    if (isAttacking) {
      attackDirectionRef.current.copy(direction)
    }
    setPlayerAttacking(isAttacking)
  }

  return (
    <>
      <Canvas shadows dpr={[1, 2]}>
        {/* Without an explicit background the canvas is transparent over a white page,
            which made the white HUD text unreadable. */}
        <color attach="background" args={['#1a1a2e']} />
        <PerspectiveCamera makeDefault position={CAMERA.initialPosition} />
        <OrbitControls
          ref={controlsRef}
          minDistance={CAMERA.minDistance}
          maxDistance={CAMERA.maxDistance}
          maxPolarAngle={CAMERA.maxPolarAngle}
          enableRotate={isGameOver}
          enablePan={false}
          enableZoom={false}
        />

        <CameraRig playerPositionRef={playerPositionRef} controlsRef={controlsRef} />
        <EnemySpawner />

        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <pointLight position={[-10, 10, -10]} intensity={0.5} />

        <Physics gravity={DEFAULT_CONFIG.physics.gravity} paused={isPaused || isGameOver}>
          <Arena />
          <Player ref={playerRef} onAttackChange={handleAttackChange} />

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
            playerAttacking={playerAttacking}
            attackDirectionRef={attackDirectionRef}
            enemyRefs={enemyRefs.current}
            playerPositionRef={playerPositionRef}
          />
        </Physics>
      </Canvas>
      <HUD />
      <PauseMenu />
    </>
  )
}
