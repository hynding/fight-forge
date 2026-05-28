# React-Three-Fiber Optimization — Design

**Date:** 2026-05-28
**Scope:** Approach B from brainstorming — hot-path fixes plus allocation/setup cleanup. No instancing, no behavior changes, no store shape changes.

## Goal

Eliminate the per-frame React re-render cascade in the game scene, remove `useState` updates inside `useFrame`, and reduce allocation/GC pressure. Behavior (movement, AI, combat, scoring, game-over) must be identical before and after.

## Root cause being fixed

[CombatSystem.tsx](../../../src/components/CombatSystem.tsx) calls `onPlayerPositionUpdate(playerVec)` every frame. That setter re-renders [GameScene.tsx](../../../src/components/GameScene.tsx), which re-runs `enemies.map(...)` and rebuilds the `otherEnemyPositions` array, passing a fresh prop to every `<Enemy>`. The result: every enemy re-renders 60×/sec even when nothing about that enemy has changed. [Player.tsx](../../../src/components/Player.tsx) compounds the problem by calling `setIsGrounded` / `setIsMoving` inside its own `useFrame`.

## Changes

### 1. Position state → refs; camera driven imperatively

[GameScene.tsx](../../../src/components/GameScene.tsx):

- Replace `const [playerPosition, setPlayerPosition] = useState(new Vector3(0, 2, 0))` with `const playerPositionRef = useRef(new Vector3(0, 2, 0))`.
- Add a new `<CameraRig>` component rendered inside `<Canvas>`. It receives `playerPositionRef` and the `OrbitControls` ref. In `useFrame` it sets `camera.position` and `controls.target` from `playerPositionRef.current`. No React state, no prop-driven camera position.
- Remove `position` and `target` props from `<PerspectiveCamera>` / `<OrbitControls>` that read from `playerPosition` state.
- Stop computing `otherEnemyPositions` inside `enemies.map`. Pass `enemyRefs.current` (the Map) directly to each `<Enemy>` as a stable prop.
- `CombatSystem` no longer needs `onPlayerPositionUpdate`. It writes player position into `playerPositionRef.current` directly each frame.

[CombatSystem.tsx](../../../src/components/CombatSystem.tsx):

- Replace `onPlayerPositionUpdate: (position: Vector3) => void` prop with `playerPositionRef: React.MutableRefObject<Vector3>`.
- In `useFrame`, mutate `playerPositionRef.current` via `.set(playerPos.x, playerPos.y, playerPos.z)`.

[Enemy.tsx](../../../src/components/Enemy.tsx):

- Replace `playerPosition?: Vector3` prop with `playerPositionRef: React.RefObject<Vector3>`. Replace `otherEnemyPositions` array prop with `enemyRefs: Map<string, React.RefObject<RapierRigidBody>>` (the Map from GameScene).
- In `useFrame`, read `playerPositionRef.current` for distance/aggro. For avoidance, iterate `enemyRefs` directly, skipping self by id, reading positions from each ref.

### 2. Player local state cleanup

[Player.tsx](../../../src/components/Player.tsx):

- `isGrounded` → `useRef(false)`. Only used inside `useFrame` for the jump condition.
- `isMoving` → `useRef(false)`. Pass `isMovingRef` to `HumanoidModel` instead of the boolean, OR keep `isMoving` as a value passed through and only call `setIsMoving` when the boolean actually flips (compare-and-set). Pick whichever HumanoidModel can consume more cleanly — see Section 5.
- Keep as `useState`: `isAttacking`, `isHurt`, `attackCooldown`. These change on discrete events (keypress, damage), not per frame, and they legitimately drive visible color/emissive/hitbox-mesh changes that require React to re-render.
- `lastDirection` is already a ref. Leave it.
- The `rotation` `Euler` is created on every render in JSX. Move into the render but reuse a module-scoped `Euler` instance via `.set()`, OR compute rotation inside `useFrame` and mutate a `group` ref's `rotation.y` directly to avoid re-rendering at all when direction changes. Prefer the latter — see Section 3.

### 3. Allocation cleanup

Per file, declare module-scoped temp instances and reuse them:

- [CombatSystem.tsx](../../../src/components/CombatSystem.tsx): `_playerVec`, `_enemyVec`, `_toEnemy` Vector3s. Replace `new Vector3(...)` and `new Vector3().subVectors(...)` calls.
- [Enemy.tsx](../../../src/components/Enemy.tsx): `_enemyVec`, `_avoidance`, `_toPlayer`, etc. Same pattern.
- [Player.tsx](../../../src/components/Player.tsx): `_euler` for rotation; assign to a group ref's rotation in `useFrame` rather than building a JSX-level `Euler` per render.

[HumanoidModel.tsx](../../../src/components/HumanoidModel.tsx):

- Memoize geometries with `useMemo` keyed on `[]` (or hoist to module scope if they have no prop dependency). Don't allocate fresh `BoxGeometry`/`SphereGeometry`/etc per render.
- Memoize materials with `useMemo` keyed on `[color, emissive, emissiveIntensity]` so they only rebuild when those visual props change.

### 4. Canvas + spawn fixes

[GameScene.tsx](../../../src/components/GameScene.tsx):

- `<Canvas shadows dpr={[1, 2]}>` to cap Retina shading at 2×.
- Periodic spawn `useEffect` currently has `[enemies.length, spawnEnemy, isGameOver]` deps, so the 5s interval restarts every spawn. Change deps to `[isGameOver]` (or `[isGameOver, spawnEnemy]`) and read enemy count inside the callback via `useGameStore.getState().enemies.length`. This makes the timer fire reliably every 5s.

### 5. HumanoidModel `isMoving` plumbing

[HumanoidModel.tsx](../../../src/components/HumanoidModel.tsx) currently receives `isMoving` as a boolean prop and presumably reads it in its own `useFrame` for the walk animation. Two options:

- **Option A (preferred):** Change the prop to `isMovingRef: React.RefObject<boolean>`. The component already runs in `useFrame`, so it reads `isMovingRef.current` per frame. No re-render needed when movement starts/stops.
- **Option B (fallback if A is awkward):** Keep the boolean prop but in Player.tsx, only call `setIsMoving(next)` when `next !== isMoving`. The current code calls it every frame, so even though React's `Object.is` check prevents the re-render, the setState call still has overhead. Compare-and-set fixes that without restructuring HumanoidModel.

Pick A unless HumanoidModel reads `isMoving` outside `useFrame` for a reason that surfaces during implementation.

### Out of scope

- Enemy instancing (`<Instances>` from drei). Saved for later; not justified at the current 8-enemy cap.
- Zustand store shape changes. The existing primitive-returning selectors are fine.
- Physics, AI behavior, combat tuning. No behavioral diffs.
- Test infrastructure. No tests exist; we're not adding any in this pass.

## Verification

No automated tests. Verification is manual + tooling:

1. `npm run lint` — clean (max-warnings 0).
2. `npm run build` — typecheck + production bundle succeed.
3. `npm run dev` — load the game and confirm the golden path:
   - Camera follows the player smoothly during movement and jumps.
   - WASD movement, Space jump, J attack, K block, Shift dodge all still respond.
   - Enemies chase the player, avoid each other (`MIN_ENEMY_SPACING` still respected), and attack within range.
   - Only one enemy damages the player at a time (`attackingEnemyId` invariant).
   - Player attack cone (60°, range 3) still damages enemies; score increments on kill; enemy disappears on health ≤ 0.
   - New enemies spawn every ~5s up to 8.
   - Game over triggers when player health hits 0; restart works.
4. React DevTools Profiler: record ~5 seconds of gameplay; `<Enemy>` render count should be near-zero during steady-state (only re-renders when its own health changes), versus ~60×N before. `<GameScene>` should also stop re-rendering every frame.

## Risk

- The camera rig change is the most behavior-visible piece. If `OrbitControls` doesn't expose a usable `target` via ref in this version, fall back to setting `camera.lookAt(playerPositionRef.current)` and skipping `OrbitControls` follow (rotation-disabled OrbitControls just needs the camera to track).
- Module-scoped temp vectors are not thread-safe across frames, but r3f's `useFrame` is single-threaded per renderer, so this is fine. Don't share a temp across two components' `useFrame`s — keep them file-local.
- `useGameStore.getState()` inside an interval reads a snapshot, not a subscription. That's the intended behavior here (we don't need to react to enemy count changes, just sample it).
