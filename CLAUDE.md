# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — TypeScript typecheck (`tsc`) then production build (`vite build`); typecheck failures fail the build
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint (flat config in `eslint.config.js`) over `ts,tsx`, runs with `--max-warnings 0` (any warning fails)
- `npm test` — Vitest, single run. Tests live next to the code as `*.test.ts` (store and pure helpers; no DOM/WebGL environment is configured)

## Tech Stack

React 18 + TypeScript + Vite. The 3D game runtime is built on:
- `@react-three/fiber` — React renderer for Three.js (`<Canvas>`, `useFrame`)
- `@react-three/drei` — helpers (`OrbitControls`, `PerspectiveCamera`)
- `@react-three/rapier` — Rapier physics (`<Physics>`, `<RigidBody>`, `RapierRigidBody`, `CuboidCollider`)
- `zustand` — global game state

## Architecture

### Screen flow
[src/App.tsx](src/App.tsx) reads `gameScreen` from the zustand store and renders one of `StartMenu`, `LoadingScreen`, or `GameScene`. All screen transitions go through `setGameScreen` in [src/store/gameStore.ts](src/store/gameStore.ts).

### Single global store
All cross-component game state lives in [src/store/gameStore.ts](src/store/gameStore.ts): `playerHealth`, `score`, `enemies` (array of `{ id, type, health, maxHealth, position }`), `isGameOver`, `isPaused`, `gameScreen`, `attackingEnemyId`, and `gameId`. Components subscribe with selectors (`useGameStore((s) => s.foo)`). Avoid adding parallel state for things the store already tracks.

### Restart, pause, and game over
`App` renders `<GameScene key={gameId} />`, and `resetGame` increments `gameId`, so a restart remounts the whole scene (fresh physics bodies, refs, and initial spawn). While `isPaused || isGameOver`, `<Physics paused>` freezes bodies and the `useFrame` loops in `Player`, `Enemy`, and `CombatSystem` return early; their timers (attack duration/cooldown, enemy attack slot) count down `delta` in those loops, so they are game-time and freeze too. Prefer that over `setTimeout` for gameplay timers.

### The `attackingEnemyId` invariant
Only **one** enemy can damage the player at a time. [src/components/CombatSystem.tsx](src/components/CombatSystem.tsx) only applies enemy-on-player damage when `attackingEnemyId === enemyId`. Enemies coordinate via `setAttackingEnemy` in the store (set from `Enemy.tsx`). Per-frame code must read `useGameStore.getState().attackingEnemyId`, not the render-time selector value, which can be frames stale and let two enemies claim the slot. An enemy holds the slot for 1s, releases it only if it still holds it, then waits a 1s recovery so others get a turn. When changing enemy AI, preserve this single-attacker rule — multiple simultaneous attackers will stack damage and break game balance.

### Rendering vs. simulation split
- **State (zustand)**: health, score, enemy list, screen — anything UIs read.
- **Refs (`RapierRigidBody`)**: positions and velocities — anything updated per-frame. Reading `translation()`/`linvel()` from a rigid body ref is the canonical way to get a current position. Do not mirror positions into React state for per-frame logic; it causes re-renders and lags physics.
- [src/components/GameScene.tsx](src/components/GameScene.tsx) owns the `playerRef` and an `enemyRefs: Map<string, RefObject<RapierRigidBody>>`. Refs are created with `createRef()` keyed by enemy id, and stale entries are pruned in a `useEffect` watching `enemies`.
- `playerPosition` is mirrored to React state only so that `OrbitControls`/`PerspectiveCamera` can follow the player declaratively. `CombatSystem` writes it via `onPlayerPositionUpdate` once per frame.

### Combat
[src/components/CombatSystem.tsx](src/components/CombatSystem.tsx) runs in `useFrame` and reads positions from the ref Map. Player attacks use a directional cone check (`attackDirection.dot(toEnemy) > 0.5`, range 3). `damageEnemy` in the store removes the enemy and adds the kill score in one update when health reaches 0 (enemies don't handle their own death). `damagedEnemiesThisAttack` (a ref-held `Set`) ensures one attack swing hits a given enemy at most once; it's cleared when the player's attack ends. Enemy damage to the player is rate-limited per enemy via `lastEnemyDamageTime` (1s cooldown).

### Player and Enemy components
Both [src/components/Player.tsx](src/components/Player.tsx) and [src/components/Enemy.tsx](src/components/Enemy.tsx) use `forwardRef<RapierRigidBody, …>` so the parent (`GameScene`) can hold refs to their physics bodies. They share [src/components/HumanoidModel.tsx](src/components/HumanoidModel.tsx) for the visual mesh and animation time. Movement is applied via `setLinvel`, not forces — instant accel + manual deceleration (`* 0.85`) gives the desired arcade feel; don't replace with damping without checking responsiveness.

Enemy AI in `Enemy.tsx` uses a `personalityTimer` and per-instance `aggressionLevel` (varies by `EnemyType`) plus a `MIN_ENEMY_SPACING` repulsion computed each frame by reading the other bodies directly from the shared `enemyRefs` Map.

The player's grounded check is a short downward Rapier ray (`world.castRay`, excluding the player's own body) plus near-zero vertical velocity. Character models are offset down 0.35 (× scale) so their feet meet the collider bottom.

### Controls
[src/hooks/useControls.ts](src/hooks/useControls.ts) maps WASD (move), Space (jump), J (attack), K (block), Shift (dodge) to a boolean state object via window key listeners; lookups are lowercased, so map keys must be lowercase. It calls `e.preventDefault()` on mapped keys and clears all keys on window blur. Block and dodge are mapped but not implemented yet, so the on-screen hints leave them out. Escape (pause) is handled separately in `PauseMenu`.

### Enemy spawning
`GameScene` spawns 4 initial enemies once (guarded by a `hasSpawnedInitial` ref to survive StrictMode double-invocation), then spawns one random-type enemy every 5s up to a cap of 8 while not game-over (ticks are skipped while paused). Health scales by type: BASIC 50, FAST 30, HEAVY 100.
