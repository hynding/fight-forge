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
import { EnemyType } from '../types/game'

const _cameraTarget = new Vector3()

const MAX_ENEMIES = 8
const SPAWN_INTERVAL_MS = 5000
const SPAWN_DISTANCE = 10
const ENEMY_HEALTH: Record<EnemyType, number> = {
  [EnemyType.BASIC]: 50,
  [EnemyType.FAST]: 30,
  [EnemyType.HEAVY]: 100,
}

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
      camera.position.set(p.x, p.y + 15, p.z + 20)
    }

    if (controlsRef.current) {
      _cameraTarget.set(p.x, p.y, p.z)
      controlsRef.current.target.copy(_cameraTarget)
      controlsRef.current.update()
    }
  })

  return null
}

export const GameScene = () => {
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, RefObject<RapierRigidBody>>>(new Map())
  const playerPositionRef = useRef(new Vector3(0, 2, 0))
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

    const positions: [number, number, number][] = [
      [5, 2, 5],
      [-5, 2, 5],
      [5, 2, -5],
      [-5, 2, -5],
    ]

    positions.forEach((pos) => {
      spawnEnemy({
        id: nextEnemyId(),
        type: EnemyType.BASIC,
        health: ENEMY_HEALTH[EnemyType.BASIC],
        maxHealth: ENEMY_HEALTH[EnemyType.BASIC],
        position: pos,
      })
    })
  }, [spawnEnemy])

  // Periodic spawn — reads live store state inside the callback. Ticks while
  // paused are skipped rather than restarting the interval, so pausing can't
  // keep resetting the spawn clock.
  useEffect(() => {
    if (isGameOver) return

    const interval = setInterval(() => {
      const { enemies: current, isPaused } = useGameStore.getState()
      if (isPaused || current.length >= MAX_ENEMIES) return

      const angle = Math.random() * Math.PI * 2
      const types = [EnemyType.BASIC, EnemyType.FAST, EnemyType.HEAVY]
      const randomType = types[Math.floor(Math.random() * types.length)]

      spawnEnemy({
        id: nextEnemyId(),
        type: randomType,
        health: ENEMY_HEALTH[randomType],
        maxHealth: ENEMY_HEALTH[randomType],
        position: [Math.cos(angle) * SPAWN_DISTANCE, 2, Math.sin(angle) * SPAWN_DISTANCE],
      })
    }, SPAWN_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isGameOver, spawnEnemy])

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
        <PerspectiveCamera makeDefault position={[0, 17, 20]} />
        <OrbitControls
          ref={controlsRef}
          minDistance={10}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2.2}
          enableRotate={isGameOver}
          enablePan={false}
          enableZoom={false}
        />

        <CameraRig playerPositionRef={playerPositionRef} controlsRef={controlsRef} />

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

        <Physics gravity={[0, -20, 0]} paused={isPaused || isGameOver}>
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
