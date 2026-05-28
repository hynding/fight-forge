# R3F Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate per-frame React re-renders in the game scene and reduce GC pressure from per-frame allocations, without changing gameplay behavior.

**Architecture:** Move per-frame mutable values (player position, isGrounded, isMoving, animationTime) from React state into refs. Drive the camera imperatively in a `useFrame` rig instead of from React props. Pass the stable `enemyRefs` Map to each enemy instead of rebuilding an `otherEnemyPositions` array in JSX. Add `useFrame` to `HumanoidModel` so it animates from refs without needing parent re-renders. Memoize geometries and materials. Reuse module-scoped Vector3/Euler temps.

**Tech Stack:** React 18, TypeScript, Vite, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `three`, `zustand`.

**Testing note:** This project has no automated test framework. Verification per task = `npm run lint` (max-warnings 0) and `npm run build` (typecheck + Vite build) must pass clean. The final task runs `npm run dev` for a manual gameplay smoke test. Do not add Jest/Vitest infrastructure — it's out of scope.

---

## File Map

- **Modify:** [src/components/HumanoidModel.tsx](../../../src/components/HumanoidModel.tsx) — accept `animationTimeRef`/`isMovingRef`, add internal `useFrame`, hoist geometries to module scope, memoize materials.
- **Modify:** [src/components/Player.tsx](../../../src/components/Player.tsx) — convert `isGrounded`/`isMoving` to refs, pass `isMovingRef`/`animationTimeRef` to `HumanoidModel`, mutate rotation via group ref instead of building an `Euler` in JSX.
- **Modify:** [src/components/Enemy.tsx](../../../src/components/Enemy.tsx) — accept `playerPositionRef` and `enemyRefs` Map (replacing `playerPosition`/`otherEnemyPositions`), pass `isMovingRef`/`animationTimeRef` to `HumanoidModel`, mutate group rotation via ref, reuse module-scoped temp Vector3s.
- **Modify:** [src/components/CombatSystem.tsx](../../../src/components/CombatSystem.tsx) — accept `playerPositionRef` (replacing `onPlayerPositionUpdate`), reuse module-scoped temp Vector3s.
- **Modify:** [src/components/GameScene.tsx](../../../src/components/GameScene.tsx) — convert `playerPosition` state to ref, add `<CameraRig>` inner component, drop `otherEnemyPositions` JSX computation, fix spawn-interval dependency, add `dpr` to `<Canvas>`.

No new files. No deletions. No package.json changes.

---

## Task 1: Fix the spawn-interval restart bug

**Files:**
- Modify: `src/components/GameScene.tsx` (the second `useEffect` that calls `setInterval`)

The current effect lists `enemies.length` in its dependency array, so the 5s interval is torn down and recreated every time an enemy spawns. Read the count via `useGameStore.getState()` inside the callback instead.

- [ ] **Step 1: Edit the effect's dependency array and read count from store inside the callback**

Replace the entire `// Spawn new enemies periodically` `useEffect` block in `src/components/GameScene.tsx` with:

```tsx
  // Spawn new enemies periodically
  useEffect(() => {
    if (isGameOver) return

    const interval = setInterval(() => {
      const currentCount = useGameStore.getState().enemies.length
      if (currentCount < 8) {
        const angle = Math.random() * Math.PI * 2
        const distance = 10
        const x = Math.cos(angle) * distance
        const z = Math.sin(angle) * distance

        const types = [EnemyType.BASIC, EnemyType.FAST, EnemyType.HEAVY]
        const randomType = types[Math.floor(Math.random() * types.length)]

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
  }, [isGameOver, spawnEnemy])
```

Also remove the `enemies` subscription at the top of the component if it's no longer read by JSX after this task — but Task 6 also depends on it, so leave it for now.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint && npm run build`
Expected: both succeed with no warnings/errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GameScene.tsx
git commit -m "fix: stop restarting enemy spawn interval on every spawn"
```

---

## Task 2: Add DPR clamp to Canvas

**Files:**
- Modify: `src/components/GameScene.tsx` (the `<Canvas>` element)

- [ ] **Step 1: Add `dpr={[1, 2]}` to the Canvas**

Find the line:

```tsx
      <Canvas shadows>
```

Replace with:

```tsx
      <Canvas shadows dpr={[1, 2]}>
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/GameScene.tsx
git commit -m "perf: clamp Canvas DPR to [1, 2] to bound Retina shading cost"
```

---

## Task 3: Restructure HumanoidModel to animate via refs

The current `HumanoidModel` computes `walkCycle` from `animationTime` at render time and applies the result via JSX `rotation={[...]}` props on each limb `<group>`. This means animation only advances when the parent component re-renders. Convert it to:
- Accept `animationTimeRef: RefObject<number>` and `isMovingRef: RefObject<boolean>` instead of value props.
- Use `useFrame` internally to compute `walkCycle` each frame and write rotations directly to limb group refs.
- Hoist shared geometries to module scope (single instance per geometry).
- Memoize the body material based on `[color, emissive, emissiveIntensity]`.

**Files:**
- Modify: `src/components/HumanoidModel.tsx`

- [ ] **Step 1: Rewrite HumanoidModel**

Replace the entire contents of `src/components/HumanoidModel.tsx` with:

```tsx
import { useRef, useMemo, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial } from 'three'

// Shared geometries — one instance reused across every humanoid.
const headGeometry = new BoxGeometry(0.3, 0.3, 0.3)
const bodyGeometry = new BoxGeometry(0.5, 0.7, 0.3)
const armGeometry = new BoxGeometry(0.15, 0.6, 0.15)
const legGeometry = new BoxGeometry(0.18, 0.6, 0.18)
const eyeGeometry = new BoxGeometry(0.06, 0.06, 0.02)

// Eye material is constant — share across all humanoids.
const eyeMaterial = new MeshBasicMaterial({ color: '#000000' })

interface HumanoidModelProps {
  color: string
  emissive?: string
  emissiveIntensity?: number
  scale?: number
  animationTimeRef: RefObject<number>
  isMovingRef: RefObject<boolean>
}

export const HumanoidModel = ({
  color,
  emissive = '#000000',
  emissiveIntensity = 0,
  scale = 1,
  animationTimeRef,
  isMovingRef,
}: HumanoidModelProps) => {
  const headRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)

  const bodyMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
      }),
    [color, emissive, emissiveIntensity]
  )

  useFrame(() => {
    const t = animationTimeRef.current ?? 0
    const moving = isMovingRef.current ?? false
    const walkCycle = Math.sin(t * 8) * 0.3 * (moving ? 1 : 0)

    if (leftArmRef.current) leftArmRef.current.rotation.x = walkCycle
    if (rightArmRef.current) rightArmRef.current.rotation.x = -walkCycle
    if (leftLegRef.current) leftLegRef.current.rotation.x = -walkCycle * 1.2
    if (rightLegRef.current) rightLegRef.current.rotation.x = walkCycle * 1.2
    if (headRef.current) headRef.current.position.y = 0.85 + Math.abs(walkCycle) * 0.05
  })

  return (
    <group scale={scale}>
      {/* Head */}
      <group ref={headRef} position={[0, 0.85, 0]}>
        <mesh geometry={headGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Body */}
      <mesh position={[0, 0.3, 0]} geometry={bodyGeometry} material={bodyMaterial} castShadow />

      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.35, 0.5, 0]}>
        <mesh position={[0, -0.2, 0]} geometry={armGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.35, 0.5, 0]}>
        <mesh position={[0, -0.2, 0]} geometry={armGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.15, -0.05, 0]}>
        <mesh position={[0, -0.3, 0]} geometry={legGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.15, -0.05, 0]}>
        <mesh position={[0, -0.3, 0]} geometry={legGeometry} material={bodyMaterial} castShadow />
      </group>

      {/* Eyes */}
      <mesh position={[-0.08, 0.9, -0.16]} geometry={eyeGeometry} material={eyeMaterial} castShadow />
      <mesh position={[0.08, 0.9, -0.16]} geometry={eyeGeometry} material={eyeMaterial} castShadow />
    </group>
  )
}
```

Note: this task **breaks the build temporarily** because Player.tsx and Enemy.tsx still pass `animationTime` and `isMoving` as values. Tasks 4 and 5 fix them.

- [ ] **Step 2: Verify the typecheck error is only the expected breakage**

Run: `npm run build`
Expected: TypeScript errors in `Player.tsx` and `Enemy.tsx` complaining about missing `animationTimeRef`/`isMovingRef` and extra `animationTime`/`isMoving`. No other errors.

- [ ] **Step 3: Do NOT commit yet**

Hold this change uncommitted until Tasks 4 and 5 land. The next commit will bundle all three.

---

## Task 4: Update Player to pass refs to HumanoidModel and use refs internally

**Files:**
- Modify: `src/components/Player.tsx`

Convert `isGrounded` and `isMoving` to refs. Stop building a JSX-level `Euler`; instead, write rotation to a group ref in `useFrame`. Pass `animationTimeRef` and `isMovingRef` to `HumanoidModel`. Keep `isAttacking`, `isHurt`, `attackCooldown` as React state — they drive material color/emissive and the attack hitbox mesh, which legitimately needs re-renders.

- [ ] **Step 1: Rewrite Player.tsx**

Replace the entire contents of `src/components/Player.tsx` with:

```tsx
import { useRef, useState, useEffect, forwardRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { useControls } from '../hooks/useControls'
import { HumanoidModel } from './HumanoidModel'
import { useGameStore } from '../store/gameStore'

interface PlayerProps {
  onAttackChange?: (isAttacking: boolean, direction: Vector3) => void
}

const SPEED = 5
const JUMP_FORCE = 8
const ATTACK_COOLDOWN = 500
const DECELERATION = 0.85

export const Player = forwardRef<RapierRigidBody, PlayerProps>(({ onAttackChange }, ref) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const playerRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
  const visualGroupRef = useRef<Group>(null)
  const controls = useControls()
  const isGroundedRef = useRef(false)
  const isMovingRef = useRef(false)
  const animationTimeRef = useRef(0)
  const lastDirection = useRef(new Vector3(0, 0, -1))
  const [isAttacking, setIsAttacking] = useState(false)
  const [attackCooldown, setAttackCooldown] = useState(0)
  const [isHurt, setIsHurt] = useState(false)
  const playerHealth = useGameStore((state) => state.playerHealth)
  const prevHealth = useRef(playerHealth)

  useEffect(() => {
    if (attackCooldown > 0) {
      const timer = setTimeout(() => setAttackCooldown(0), attackCooldown)
      return () => clearTimeout(timer)
    }
  }, [attackCooldown])

  // Flash red when taking damage
  useEffect(() => {
    if (playerHealth < prevHealth.current) {
      setIsHurt(true)
      const timer = setTimeout(() => setIsHurt(false), 200)
      prevHealth.current = playerHealth
      return () => clearTimeout(timer)
    }
    prevHealth.current = playerHealth
  }, [playerHealth])

  useFrame((_, delta) => {
    if (!playerRef.current) return

    animationTimeRef.current += delta

    const velocity = playerRef.current.linvel()

    let targetVelX = 0
    let targetVelZ = 0

    if (controls.forward) targetVelZ = -SPEED
    else if (controls.backward) targetVelZ = SPEED

    if (controls.left) targetVelX = -SPEED
    else if (controls.right) targetVelX = SPEED

    let newVelX = velocity.x
    let newVelZ = velocity.z

    if (targetVelX !== 0 || targetVelZ !== 0) {
      newVelX = targetVelX
      newVelZ = targetVelZ
    } else {
      newVelX *= DECELERATION
      newVelZ *= DECELERATION
      if (Math.abs(newVelX) < 0.1) newVelX = 0
      if (Math.abs(newVelZ) < 0.1) newVelZ = 0
    }

    const isCurrentlyMoving = Math.abs(newVelX) > 0.1 || Math.abs(newVelZ) > 0.1
    isMovingRef.current = isCurrentlyMoving

    if (newVelX !== 0 || newVelZ !== 0) {
      lastDirection.current.set(newVelX, 0, newVelZ).normalize()
    }

    playerRef.current.setLinvel({ x: newVelX, y: velocity.y, z: newVelZ }, true)

    // Jump
    if (controls.jump && isGroundedRef.current) {
      playerRef.current.setLinvel({ x: newVelX, y: JUMP_FORCE, z: newVelZ }, true)
    }

    // Attack
    if (controls.attack && !isAttacking && attackCooldown === 0) {
      setIsAttacking(true)
      onAttackChange?.(true, lastDirection.current.clone())
      setAttackCooldown(ATTACK_COOLDOWN)
      setTimeout(() => {
        setIsAttacking(false)
        onAttackChange?.(false, new Vector3())
      }, 200)
    }

    // Grounded check
    const position = playerRef.current.translation()
    isGroundedRef.current = position.y < 1.1

    // Drive rotation imperatively from current facing direction
    if (visualGroupRef.current) {
      visualGroupRef.current.rotation.y = Math.atan2(
        -lastDirection.current.x,
        -lastDirection.current.z
      )
    }
  })

  return (
    <RigidBody
      ref={playerRef}
      colliders={false}
      position={[0, 2, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={1}
    >
      <CuboidCollider args={[0.25, 1, 0.25]} />

      <group ref={visualGroupRef}>
        <HumanoidModel
          color={isHurt ? '#ff0000' : isAttacking ? '#ff4444' : '#4444ff'}
          emissive={isAttacking || isHurt ? '#ff0000' : '#000000'}
          emissiveIntensity={isAttacking || isHurt ? 0.5 : 0}
          animationTimeRef={animationTimeRef}
          isMovingRef={isMovingRef}
        />

        {isAttacking && (
          <mesh position={[0, 0, -1.2]}>
            <boxGeometry args={[1.2, 1.5, 0.8]} />
            <meshBasicMaterial
              color="#ff0000"
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </RigidBody>
  )
})
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: only `src/components/Enemy.tsx` should still have type errors (it still passes `animationTime`/`isMoving` as values and references `playerPosition`/`otherEnemyPositions`). Player and HumanoidModel should be clean.

- [ ] **Step 3: Do NOT commit yet**

Wait for Task 5.

---

## Task 5: Update Enemy to use refs and accept enemyRefs Map / playerPositionRef

**Files:**
- Modify: `src/components/Enemy.tsx`

Replace `playerPosition` and `otherEnemyPositions` props with `playerPositionRef` and `enemyRefs`. Mutate group rotation via ref instead of JSX `Euler`. Pass `animationTimeRef`/`isMovingRef` to `HumanoidModel`. Use module-scoped temp Vector3s for all per-frame allocation sites.

- [ ] **Step 1: Rewrite Enemy.tsx**

Replace the entire contents of `src/components/Enemy.tsx` with:

```tsx
import { useRef, useEffect, forwardRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { EnemyType } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { HumanoidModel } from './HumanoidModel'

// Module-scoped temp vectors — reused every frame to avoid allocations.
// Safe because Enemy.useFrame is single-threaded per renderer.
const _enemyVec = new Vector3()
const _toOther = new Vector3()
const _direction = new Vector3()
const _avoidanceForce = new Vector3()
const _moveDirection = new Vector3()
const _toPlayer = new Vector3()
const _circleDir = new Vector3()
const _otherPos = new Vector3()
const _patrolDelta = new Vector3()

interface EnemyProps {
  id: string
  type: EnemyType
  position: [number, number, number]
  playerPositionRef: RefObject<Vector3>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
}

export const Enemy = forwardRef<RapierRigidBody, EnemyProps>(
  ({ id, type, position, playerPositionRef, enemyRefs }, ref) => {
    const rigidBodyRef = useRef<RapierRigidBody>(null)
    const enemyRef = (ref as React.RefObject<RapierRigidBody>) || rigidBodyRef
    const visualGroupRef = useRef<Group>(null)
    const facingDirection = useRef(new Vector3(0, 0, -1))
    const patrolTarget = useRef<Vector3 | null>(null)
    const patrolTimer = useRef(0)
    const personalityTimer = useRef(Math.random() * 1000)
    const animationTimeRef = useRef(0)
    const isMovingRef = useRef(false)

    const removeEnemy = useGameStore((state) => state.removeEnemy)
    const addScore = useGameStore((state) => state.addScore)
    const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
    const setAttackingEnemy = useGameStore((state) => state.setAttackingEnemy)

    const aggressionLevel = useRef(
      type === EnemyType.FAST ? 1.2 : type === EnemyType.HEAVY ? 0.8 : 1.0
    )

    const health = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.health ?? 50
    })
    const maxHealth = useGameStore((state) => {
      const enemy = state.enemies.find((e) => e.id === id)
      return enemy?.maxHealth ?? 50
    })

    const isAttacking = attackingEnemyId === id

    const AGGRO_RANGE = 10 * aggressionLevel.current
    const ATTACK_RANGE = 1.5
    const SPEED = type === EnemyType.FAST ? 3 : type === EnemyType.HEAVY ? 1.5 : 2
    const MIN_ENEMY_SPACING = 2.5

    useEffect(() => {
      if (health <= 0) {
        removeEnemy(id)
        addScore(100)
      }
    }, [health, id, removeEnemy, addScore])

    useFrame((_, delta) => {
      if (!enemyRef.current || !playerPositionRef.current) return

      animationTimeRef.current += delta

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distanceToPlayer = _enemyVec.distanceTo(playerPositionRef.current)

      const vel = enemyRef.current.linvel()
      isMovingRef.current = Math.abs(vel.x) > 0.1 || Math.abs(vel.z) > 0.1

      personalityTimer.current += delta * 1000

      // Avoidance against other enemies — read positions directly from refs.
      _avoidanceForce.set(0, 0, 0)
      enemyRefs.forEach((otherRef, otherId) => {
        if (otherId === id || !otherRef.current) return
        const op = otherRef.current.translation()
        _otherPos.set(op.x, op.y, op.z)
        _toOther.subVectors(_enemyVec, _otherPos)
        const distToOther = _toOther.length()
        if (distToOther < MIN_ENEMY_SPACING && distToOther > 0) {
          _toOther
            .normalize()
            .multiplyScalar((MIN_ENEMY_SPACING - distToOther) / MIN_ENEMY_SPACING)
          _avoidanceForce.add(_toOther)
        }
      })

      if (distanceToPlayer < AGGRO_RANGE) {
        _direction.subVectors(playerPositionRef.current, _enemyVec).normalize()
        facingDirection.current.copy(_direction)

        const hasAvoidance = _avoidanceForce.length() > 0.1

        if (distanceToPlayer > ATTACK_RANGE) {
          _moveDirection.copy(_direction)

          if (hasAvoidance) {
            _avoidanceForce.normalize().multiplyScalar(0.7)
            _moveDirection.multiplyScalar(0.3)
            _moveDirection.add(_avoidanceForce).normalize()
          }

          enemyRef.current.setLinvel(
            {
              x: _moveDirection.x * SPEED,
              y: enemyRef.current.linvel().y,
              z: _moveDirection.z * SPEED,
            },
            true
          )
        } else {
          const shouldHold =
            hasAvoidance && attackingEnemyId !== null && attackingEnemyId !== id

          if (shouldHold) {
            _circleDir.set(-_direction.z, 0, _direction.x)
            enemyRef.current.setLinvel(
              {
                x: _circleDir.x * SPEED * 0.5,
                y: enemyRef.current.linvel().y,
                z: _circleDir.z * SPEED * 0.5,
              },
              true
            )
          } else {
            enemyRef.current.setLinvel(
              { x: 0, y: enemyRef.current.linvel().y, z: 0 },
              true
            )

            if (!isAttacking && attackingEnemyId === null) {
              _toPlayer.subVectors(playerPositionRef.current, _enemyVec).normalize()
              const dotProduct = facingDirection.current.dot(_toPlayer)

              if (dotProduct > 0.5) {
                setAttackingEnemy(id)
                setTimeout(() => {
                  setAttackingEnemy(null)
                }, 1000)
              }
            }
          }
        }
      } else {
        // Patrol behavior
        patrolTimer.current += delta * 1000

        if (!patrolTarget.current || patrolTimer.current > 3000) {
          const angle = Math.random() * Math.PI * 2
          const distance = 3 + Math.random() * 5
          patrolTarget.current = new Vector3(
            enemyPos.x + Math.cos(angle) * distance,
            enemyPos.y,
            enemyPos.z + Math.sin(angle) * distance
          )
          patrolTimer.current = 0
        }

        _patrolDelta.subVectors(patrolTarget.current, _enemyVec)
        const distToPatrol = _patrolDelta.length()

        if (distToPatrol > 0.5) {
          _patrolDelta.normalize()
          facingDirection.current.copy(_patrolDelta)

          enemyRef.current.setLinvel(
            {
              x: _patrolDelta.x * SPEED * 0.3,
              y: enemyRef.current.linvel().y,
              z: _patrolDelta.z * SPEED * 0.3,
            },
            true
          )
        } else {
          enemyRef.current.setLinvel(
            { x: 0, y: enemyRef.current.linvel().y, z: 0 },
            true
          )
        }
      }

      // Drive rotation imperatively from facing direction
      if (visualGroupRef.current) {
        visualGroupRef.current.rotation.y = Math.atan2(
          -facingDirection.current.x,
          -facingDirection.current.z
        )
      }
    })

    const getColor = () => {
      switch (type) {
        case EnemyType.FAST:
          return '#ffff00'
        case EnemyType.HEAVY:
          return '#ff0000'
        default:
          return '#00ff00'
      }
    }

    const getScale = (): number => {
      switch (type) {
        case EnemyType.HEAVY:
          return 1.3
        case EnemyType.FAST:
          return 0.8
        default:
          return 1
      }
    }

    const scale = getScale()

    return (
      <RigidBody
        ref={enemyRef}
        colliders={false}
        position={position}
        enabledRotations={[false, false, false]}
        linearDamping={2}
      >
        <CuboidCollider args={[0.25 * scale, 1 * scale, 0.25 * scale]} />

        <group ref={visualGroupRef}>
          <HumanoidModel
            color={isAttacking ? '#ffffff' : getColor()}
            emissive={isAttacking ? '#ff0000' : '#000000'}
            emissiveIntensity={isAttacking ? 0.5 : 0}
            scale={scale}
            animationTimeRef={animationTimeRef}
            isMovingRef={isMovingRef}
          />

          {isAttacking && (
            <mesh position={[0, 0, -0.5 * scale]}>
              <boxGeometry args={[1.5 * scale, 1.5 * scale, 1 * scale]} />
              <meshBasicMaterial
                color="#ff0000"
                transparent
                opacity={0.3}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Health bar background */}
          <mesh position={[0, 1.5 * scale, 0]} renderOrder={1000}>
            <boxGeometry args={[1.2, 0.15, 0.02]} />
            <meshBasicMaterial color="#333333" depthTest={false} />
          </mesh>

          {/* Health bar fill */}
          <mesh
            position={[-(1.2 * (1 - health / maxHealth)) / 2, 1.5 * scale, 0.01]}
            renderOrder={1001}
          >
            <boxGeometry args={[1.2 * (health / maxHealth), 0.15, 0.02]} />
            <meshBasicMaterial
              color={
                health / maxHealth > 0.5
                  ? '#00ff00'
                  : health / maxHealth > 0.25
                    ? '#ffff00'
                    : '#ff0000'
              }
              depthTest={false}
            />
          </mesh>

          {/* Health bar border */}
          <mesh position={[0, 1.5 * scale, 0.02]} renderOrder={1002}>
            <boxGeometry args={[1.24, 0.19, 0.01]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5} depthTest={false} />
          </mesh>
        </group>
      </RigidBody>
    )
  }
)
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: only `src/components/GameScene.tsx` should now have type errors (it still passes `playerPosition`/`otherEnemyPositions` to `<Enemy>`). HumanoidModel, Player, and Enemy should be clean.

- [ ] **Step 3: Do NOT commit yet**

Wait for Task 6.

---

## Task 6: Refactor CombatSystem to write into playerPositionRef

**Files:**
- Modify: `src/components/CombatSystem.tsx`

Replace `onPlayerPositionUpdate` prop with `playerPositionRef`. Reuse module-scoped temp vectors.

- [ ] **Step 1: Rewrite CombatSystem.tsx**

Replace the entire contents of `src/components/CombatSystem.tsx` with:

```tsx
import { useRef, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'

const _playerVec = new Vector3()
const _enemyVec = new Vector3()
const _toEnemy = new Vector3()

const ATTACK_RANGE = 3
const ATTACK_CONE = 0.5

interface CombatSystemProps {
  playerRef: React.RefObject<RapierRigidBody>
  playerAttacking: boolean
  attackDirection: Vector3
  enemyRefs: Map<string, React.RefObject<RapierRigidBody>>
  playerPositionRef: RefObject<Vector3>
}

export const CombatSystem = ({
  playerRef,
  playerAttacking,
  attackDirection,
  enemyRefs,
  playerPositionRef,
}: CombatSystemProps) => {
  const damagePlayer = useGameStore((state) => state.damagePlayer)
  const damageEnemy = useGameStore((state) => state.damageEnemy)
  const attackingEnemyId = useGameStore((state) => state.attackingEnemyId)
  const lastEnemyDamageTime = useRef<Map<string, number>>(new Map())
  const damagedEnemiesThisAttack = useRef<Set<string>>(new Set())
  const lastAttackState = useRef(false)

  useFrame(() => {
    if (!playerRef.current) return

    const playerPos = playerRef.current.translation()
    _playerVec.set(playerPos.x, playerPos.y, playerPos.z)

    // Mutate the shared player-position ref so camera + enemies read the latest value.
    if (playerPositionRef.current) {
      playerPositionRef.current.copy(_playerVec)
    }

    const now = Date.now()

    if (!playerAttacking && lastAttackState.current) {
      damagedEnemiesThisAttack.current.clear()
    }
    lastAttackState.current = playerAttacking

    enemyRefs.forEach((enemyRef, enemyId) => {
      if (!enemyRef.current) return

      const enemyPos = enemyRef.current.translation()
      _enemyVec.set(enemyPos.x, enemyPos.y, enemyPos.z)
      const distance = _playerVec.distanceTo(_enemyVec)

      const lastDmg = lastEnemyDamageTime.current.get(enemyId) || 0
      if (attackingEnemyId === enemyId && distance < 2 && now - lastDmg > 1000) {
        damagePlayer(10)
        lastEnemyDamageTime.current.set(enemyId, now)
      }

      if (playerAttacking && !damagedEnemiesThisAttack.current.has(enemyId)) {
        _toEnemy.subVectors(_enemyVec, _playerVec).normalize()
        const dotProduct = attackDirection.dot(_toEnemy)

        if (distance < ATTACK_RANGE && dotProduct > ATTACK_CONE) {
          damageEnemy(enemyId, 20)
          damagedEnemiesThisAttack.current.add(enemyId)
        }
      }
    })
  })

  return null
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: only `src/components/GameScene.tsx` errors remain (mismatched props on `CombatSystem`, `Enemy`, and stale `playerPosition` state).

- [ ] **Step 3: Do NOT commit yet**

Wait for Task 7.

---

## Task 7: Refactor GameScene — ref-based player position, CameraRig, stable enemy props

**Files:**
- Modify: `src/components/GameScene.tsx`

Convert `playerPosition` state to ref. Add an inner `<CameraRig>` component that runs `useFrame` inside `<Canvas>` and imperatively follows the player. Drop the `otherEnemyPositions` JSX computation. Pass `enemyRefs.current` and `playerPositionRef` to children.

- [ ] **Step 1: Rewrite GameScene.tsx**

Replace the entire contents of `src/components/GameScene.tsx` with:

```tsx
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

interface CameraRigProps {
  playerPositionRef: RefObject<Vector3>
  controlsRef: RefObject<OrbitControlsImpl>
}

const CameraRig = ({ playerPositionRef, controlsRef }: CameraRigProps) => {
  const { camera } = useThree()

  useFrame(() => {
    const p = playerPositionRef.current
    if (!p) return

    camera.position.set(p.x, p.y + 15, p.z + 20)

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

    positions.forEach((pos, idx) => {
      spawnEnemy({
        id: `enemy-${idx}`,
        type: EnemyType.BASIC,
        health: 50,
        maxHealth: 50,
        position: pos,
      })
    })
  }, [spawnEnemy])

  // Periodic spawn (5s) — reads enemy count from store snapshot inside callback
  useEffect(() => {
    if (isGameOver) return

    const interval = setInterval(() => {
      const currentCount = useGameStore.getState().enemies.length
      if (currentCount < 8) {
        const angle = Math.random() * Math.PI * 2
        const distance = 10
        const x = Math.cos(angle) * distance
        const z = Math.sin(angle) * distance

        const types = [EnemyType.BASIC, EnemyType.FAST, EnemyType.HEAVY]
        const randomType = types[Math.floor(Math.random() * types.length)]

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

        <Physics gravity={[0, -20, 0]}>
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
            attackDirection={attackDirectionRef.current}
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
```

**Note on the `OrbitControls` ref type:** It comes from `three-stdlib`, which is a transitive dep of `@react-three/drei`. If `import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'` doesn't resolve, fall back to:

```tsx
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
```

Or, simplest: type `controlsRef` as `useRef<any>(null)` to dodge the import. Prefer the explicit type if it resolves.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint && npm run build`
Expected: clean. No errors, no warnings.

If `three-stdlib` import fails, switch to the `three/examples/jsm/...` import or `useRef<any>` per the note above, then re-run.

- [ ] **Step 3: Commit all five changed files together**

```bash
git add src/components/HumanoidModel.tsx src/components/Player.tsx src/components/Enemy.tsx src/components/CombatSystem.tsx src/components/GameScene.tsx
git commit -m "perf: drive position/animation via refs, kill per-frame React re-renders

- HumanoidModel: animate via internal useFrame + group refs; share
  geometries at module scope; memoize body material.
- Player: convert isGrounded/isMoving to refs; drive rotation via
  group ref; pass refs to HumanoidModel.
- Enemy: accept playerPositionRef + enemyRefs Map; reuse module-scoped
  temp Vector3s for all per-frame math; drive rotation via group ref.
- CombatSystem: write into playerPositionRef instead of state callback;
  reuse module-scoped temp Vector3s.
- GameScene: playerPosition is a ref; CameraRig drives camera + orbit
  target imperatively each frame; stop rebuilding otherEnemyPositions
  in JSX (Enemy iterates enemyRefs directly)."
```

---

## Task 8: Manual gameplay verification

**Files:** none modified.

- [ ] **Step 1: Build and run dev server**

Run: `npm run dev`
Open the URL Vite prints in a browser.

- [ ] **Step 2: Golden-path smoke test**

Click "Start" (or whatever begins the game). Confirm in order:

1. Camera follows the player smoothly during WASD movement.
2. Space jumps; camera tracks vertically.
3. J swings an attack; red attack hitbox appears briefly in front of the player.
4. Standing next to an enemy and pressing J damages it (its health bar shrinks); after multiple hits it disappears and the score increments by 100.
5. Walking near an enemy in its aggro range causes it to chase you.
6. Two enemies near each other visibly avoid each other (don't stack).
7. Only one enemy at a time attacks you (you see the white "attacking" enemy color); your health drops on contact while it's attacking, with about a 1-second cooldown between hits.
8. After ~5 seconds, a new enemy spawns from somewhere on the perimeter (up to a cap of 8).
9. Let yourself die: when health hits 0, the game-over state triggers and you can orbit the camera with the mouse.
10. Walk animation: the player's arms and legs swing while moving; enemies' arms and legs swing while chasing or patrolling. They stand still when not moving.

If any of these regress, the relevant task's edits are wrong — bisect by reverting the last commit and re-running.

- [ ] **Step 3: Optional perf check with React DevTools Profiler**

If React DevTools is installed: open the Profiler tab, click record, play for ~5 seconds, stop.

Expected: `GameScene`, `Player`, and individual `Enemy` components should show very few commits during steady-state gameplay (only when health changes, attack state toggles, or hurt flashes fire). Pre-optimization, every frame produced a commit cascade.

- [ ] **Step 4: Final commit if any docs need updating**

If everything passes, no further commit needed. If you tweaked anything during verification, commit it now.

---

## Self-Review Notes

- **Spec coverage:** All five spec sections covered. Section 1 → Tasks 6, 7. Section 2 → Task 4. Section 3 → baked into Tasks 3, 5, 6 (module-scoped temps + memoized materials). Section 4 → Tasks 1, 2. Section 5 → Task 3 (resolved as Option A from spec).
- **Spec divergence:** The spec said HumanoidModel "already runs animation internally in `useFrame`" — it doesn't. Task 3 adds the `useFrame` and rewrites animation to mutate refs. This is a corrected implementation of the spec's intent, not new scope.
- **No tests:** Project has no test framework; verification is typecheck + lint per task and a manual smoke test in Task 8. This is consistent with the spec's "Verification" section.
- **Commit grouping:** Tasks 3–7 land as one commit because the type system can't go green until all five files are in sync. Earlier tasks (1, 2) commit independently.
