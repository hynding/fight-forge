import { useRef, useEffect, useState, createRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { Player } from './Player'
import { Enemy } from './Enemy'
import { Arena } from './Arena'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { CombatSystem } from './CombatSystem'
import { useGameStore } from '../store/gameStore'
import { EnemyType } from '../types/game'

export const GameScene = () => {
  const playerRef = useRef<RapierRigidBody>(null)
  const enemyRefs = useRef<Map<string, React.RefObject<RapierRigidBody>>>(new Map())
  const [playerAttacking, setPlayerAttacking] = useState(false)
  const [attackDirection, setAttackDirection] = useState(new Vector3(0, 0, -1))
  const [playerPosition, setPlayerPosition] = useState(new Vector3(0, 2, 0))

  const handleAttackChange = (isAttacking: boolean, direction: Vector3) => {
    setPlayerAttacking(isAttacking)
    if (isAttacking) {
      setAttackDirection(direction)
    }
  }

  const enemies = useGameStore((state) => state.enemies)
  const spawnEnemy = useGameStore((state) => state.spawnEnemy)
  const isGameOver = useGameStore((state) => state.isGameOver)
  const hasSpawnedInitial = useRef(false)

  // Spawn initial enemies only once
  useEffect(() => {
    if (hasSpawnedInitial.current) return
    hasSpawnedInitial.current = true

    const positions: [number, number, number][] = [
      [5, 2, 5],
      [-5, 2, 5],
      [5, 2, -5],
      [-5, 2, -5],
    ]

    positions.forEach((pos, idx) => {
      spawnEnemy({
        id: `enemy-${idx}`,
        type: EnemyType.BASIC,
        health: 50,
        maxHealth: 50,
        position: pos,
      })
    })
  }, [])

  // Spawn new enemies periodically
  useEffect(() => {
    if (isGameOver) return

    const interval = setInterval(() => {
      if (enemies.length < 8) {
        const angle = Math.random() * Math.PI * 2
        const distance = 10
        const x = Math.cos(angle) * distance
        const z = Math.sin(angle) * distance

        const types = [EnemyType.BASIC, EnemyType.FAST, EnemyType.HEAVY]
        const randomType = types[Math.floor(Math.random() * types.length)]

        // Different health based on enemy type
        const healthMap = {
          [EnemyType.BASIC]: 50,
          [EnemyType.FAST]: 30,
          [EnemyType.HEAVY]: 100,
        }

        spawnEnemy({
          id: `enemy-${Date.now()}`,
          type: randomType,
          health: healthMap[randomType],
          maxHealth: healthMap[randomType],
          position: [x, 2, z],
        })
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [enemies.length, spawnEnemy, isGameOver])

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
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[playerPosition.x, playerPosition.y + 15, playerPosition.z + 20]} />
        <OrbitControls
          target={[playerPosition.x, playerPosition.y, playerPosition.z]}
          minDistance={10}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2.2}
          enableRotate={isGameOver}
          enablePan={false}
          enableZoom={false}
        />

        {/* Lighting */}
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

        <Physics gravity={[0, -20, 0]}>
          <Arena />
          <Player ref={playerRef} onAttackChange={handleAttackChange} />

          {enemies.map((enemy) => {
            if (!enemyRefs.current.has(enemy.id)) {
              enemyRefs.current.set(enemy.id, createRef<RapierRigidBody>())
            }

            // Get positions of other enemies for spacing AI
            const otherEnemyPositions = enemies
              .filter(e => e.id !== enemy.id)
              .map(e => {
                const ref = enemyRefs.current.get(e.id)
                if (ref?.current) {
                  const pos = ref.current.translation()
                  return {
                    id: e.id,
                    position: new Vector3(pos.x, pos.y, pos.z)
                  }
                }
                return null
              })
              .filter((p): p is { id: string; position: Vector3 } => p !== null)

            return (
              <Enemy
                key={enemy.id}
                ref={enemyRefs.current.get(enemy.id)!}
                id={enemy.id}
                type={enemy.type}
                position={enemy.position}
                playerPosition={playerPosition}
                otherEnemyPositions={otherEnemyPositions}
              />
            )
          })}

          <CombatSystem
            playerRef={playerRef}
            playerAttacking={playerAttacking}
            attackDirection={attackDirection}
            enemyRefs={enemyRefs.current}
            onPlayerPositionUpdate={setPlayerPosition}
          />
        </Physics>
      </Canvas>
      <HUD />
      <PauseMenu />
    </>
  )
}
