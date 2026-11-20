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
- `@react-three/drei` — helpers (`PerspectiveCamera`, `Billboard`, `useGLTF`, `useAnimations`)
- `@react-three/rapier` — Rapier physics (`<Physics>`, `<RigidBody>`, `RapierRigidBody`, `CuboidCollider`)
- `zustand` — global game state

## Architecture

### Screen flow
[src/App.tsx](src/App.tsx) reads `gameScreen` from the zustand store and renders one of `StartMenu`, `LoadingScreen`, or `GameScene`. All screen transitions go through `setGameScreen` in [src/store/gameStore.ts](src/store/gameStore.ts).

### Single global store
All cross-component game state lives in [src/store/gameStore.ts](src/store/gameStore.ts): `playerHealth`, `score`, `enemies` (array of `{ id, type, health, maxHealth, position }`), `isGameOver`, `isPaused`, `gameScreen`, `attackingEnemyId`, and `gameId`. Components subscribe with selectors (`useGameStore((s) => s.foo)`). Avoid adding parallel state for things the store already tracks.

### Restart, pause, and game over
`App` renders `<GameScene key={gameId} />`, and `resetGame` increments `gameId`, so a restart remounts the whole scene (fresh physics bodies, refs, and initial spawn). While `isFrozen(state)` (paused, game over, or level complete), `<Physics paused>` freezes bodies, the sim loop stops advancing, and the movement `useFrame` loops in `Player` and `Enemy` return early, so all gameplay timers are game time and freeze too. Prefer game-time timers over `setTimeout` for gameplay.

### Fixed-step simulation loop
Gameplay timers and rules run as **systems** in a fixed 60 Hz loop: [src/sim/loop.ts](src/sim/loop.ts) (`SimLoop`, `SIM_STEP`, `SYSTEM_ORDER`). `<SimLoopDriver>` (inside the `Canvas`, wrapping `Physics`) owns one loop per scene and advances it once per rendered frame unless paused or game over; each frame's delta goes through `gameStep` from [src/utils/gameTime.ts](src/utils/gameTime.ts), which clamps the huge first-frame delta after a hidden tab. Components register systems with `useSimSystem(name, SYSTEM_ORDER.x, step)` from [src/sim/simContext.ts](src/sim/simContext.ts); systems always receive `dt = SIM_STEP` and run in `SYSTEM_ORDER` (fighters, camera, player attack, enemy attack slots, combat, level), so combat sees a move on the step it starts. Use `loop.time` (via `useSimLoop()`) as the game clock. Timer, move, reaction and hit math live as pure functions in `src/sim` (`timers.ts`, `moves.ts`, `reactions.ts`, `combat.ts`) with unit tests.

### The `attackingEnemyId` invariant
Only **one** enemy can damage the player at a time. [src/components/CombatSystem.tsx](src/components/CombatSystem.tsx) only lets an enemy's hitbox hit the player when `attackingEnemyId === enemyId`. Enemies coordinate via `setAttackingEnemy` in the store. Per-step code must read `useGameStore.getState().attackingEnemyId`, not the render-time selector value, which can be frames stale and let two enemies claim the slot. The AI only says it wants to attack; the enemy's `enemyAttackSlot:<id>` sim system claims the free slot, throws one `enemy.attackMove`, holds the slot for `enemy.attackSlotDuration`, releases it only if it still holds it (or early if the enemy is hit), then waits `enemy.attackSlotRecovery` so others get a turn. When changing enemy AI, preserve this single-attacker rule — multiple simultaneous attackers will stack damage and break game balance.

### Rendering vs. simulation split
- **State (zustand)**: health, score, enemy list, screen — anything UIs read.
- **Refs (`RapierRigidBody`)**: positions and velocities — anything updated per-frame. Reading `translation()`/`linvel()` from a rigid body ref is the canonical way to get a current position. Do not mirror positions into React state for per-frame logic; it causes re-renders and lags physics.
- [src/components/GameScene.tsx](src/components/GameScene.tsx) owns the `playerRef` and an `enemyRefs: Map<string, RefObject<RapierRigidBody>>`. Refs are created with `createRef()` keyed by enemy id, and stale entries are pruned in a `useEffect` watching `enemies`.
- `playerPositionRef` (a shared `Vector3`) is copied from the player body by a `useFrame` in `CombatSystem` every rendered frame; `CameraRig` reads it in its `useFrame` and the enemy AI reads it in its sim step. Nothing mirrors it into React state.

### Moves, hitboxes and combat
Attacks are **moves** with frame data, defined by name in `DEFAULT_CONFIG.moves` and stepped by pure code in [src/sim/moves.ts](src/sim/moves.ts): `startup` / `active` / `recovery` seconds, `damage`, a `hitbox` (a box in front of the attacker along its facing, × its scale), the `reaction` it causes, an optional `clip` (the model plays it once per move instance), and an optional `next` move reached by a buffered press once the cancel window (`cancelFrom`, default end of active) opens. The player's J starts `player.lightAttack` (jab → jab2 → hook → uppercut); presses are edge-triggered, so holding J doesn't repeat. Each fighter's `MoveRunner` and `ReactionState` live on its `FighterRuntime`; while busy with either, the controller can't walk, jump or turn (`isBusy`).

[src/components/CombatSystem.tsx](src/components/CombatSystem.tsx) is the `combat` sim system. Fighters register their runtimes in the `runtimes` Map owned by `GameScene` (the player as `"player"`, enemies by id). For each fighter in a move's active frames it overlaps the hitbox with targets' hurtboxes (the collider's half extents) using `hitboxWorld` / `boxesOverlap` from [src/sim/combat.ts](src/sim/combat.ts); a move instance hits each target at most once. A hit calls `applyHit` ([src/sim/reactions.ts](src/sim/reactions.ts)): hitstun, or knockdown → getup → brief invulnerability (`DEFAULT_CONFIG.reactions`), sets knockback on the runtime and body, interrupts the target's move, and calls `damagePlayer` / `damageEnemy`. `damageEnemy` in the store removes the enemy and adds the kill score in one update when health reaches 0. Press H for the hitbox debug overlay (`showHitboxes` in the store): hurtboxes in green, active hitboxes in red.

### Tuning config
Every gameplay tuning value (speeds, jump, moves and their frame data, hit reactions, enemy stats per `EnemyType`, spawning, camera, stage, scoring) lives in `DEFAULT_CONFIG` in [src/config/defaults.ts](src/config/defaults.ts), typed by `GameConfig`. Components read from it; don't add gameplay literals to components. Times there are seconds of game time. A snapshot test guards it, so retuning means updating the snapshot deliberately (`npx vitest run -u`). Later this becomes the default content pack.

### Fighters and controllers
Player and enemies are both **fighters**. [src/components/FighterBody.tsx](src/components/FighterBody.tsx) is the one shared body: rigid body and collider, a `fighter:<name>` sim system (order `SYSTEM_ORDER.fighters`, before attacks and combat) that steps the hit reaction, asks a controller for an `Intent`, moves (or slides with knockback while reacting), jumps, updates facing and the fighter state machine, plus the model, attack tint, hurt flash and hitbox overlay. [Player.tsx](src/components/Player.tsx) and [Enemy.tsx](src/components/Enemy.tsx) are thin wrappers that supply the controller and start moves (the player's combo; an enemy's attack when it takes the slot). Both use `forwardRef<RapierRigidBody, …>` so `GameScene` holds refs to their bodies.

The pure logic is in `src/sim`: [fighter.ts](src/sim/fighter.ts) (`Intent`, `FighterStateName`, `nextFighterState`, `stepVelocity`, `updateFacing`, `FighterRuntime`, `isBusy`) and [controllers.ts](src/sim/controllers.ts) (`inputIntent` for the keyboard, `brawlerIntent` for today's enemy AI). Each fighter's live `FighterRuntime` (state, facing, velocity, grounded, last intent, move, reaction, scale, hurtbox) is a mutable object updated every step; read it, don't mirror it into React state. Visuals (animation clock, model yaw) update in a render-rate `useFrame`.

Movement is applied via `setLinvel`, not forces: instant accel to `intent.move × walkSpeed`, then deceleration per 60 Hz step (`player.deceleration` 0.85 for the arcade slide, `enemy.deceleration` 0 for an instant stop); don't replace with damping without checking responsiveness. The `brawler` AI scales aggro range by the type's `aggression`, keeps `enemy.minSpacing` from other enemies (read directly from the shared `enemyRefs` Map), circles while another enemy holds the slot, and patrols outside aggro range. AI distances are planar (X/Z).

The grounded check is a short downward Rapier ray (`world.castRay`, excluding the fighter's own body, length `body.groundRayLength × scale`) plus near-zero vertical velocity. Collider half extents come from the fighter definition (`colliderHalfExtents`, default `body.colliderHalfExtents`, × scale).

### Character models
Each fighter definition has a `model: ModelRef` ([src/config/defaults.ts](src/config/defaults.ts)): `procedural` (the box `HumanoidModel`) or `gltf` (URL, scale, offset, `rotationY` to face -Z, `tintMaterials` recolored with the fighter's color, and a `clips` map from fighter state to clip name, optionally with a speed). [FighterModel.tsx](src/components/FighterModel.tsx) renders it; a glTF goes through `Suspense` and `ModelErrorBoundary`, with the box humanoid shown while loading and if it fails. [GltfModel.tsx](src/components/GltfModel.tsx) clones the cached scene per fighter (`SkeletonUtils.clone`, cloned materials) and plays the clip `resolveClip` ([src/sim/animation.ts](src/sim/animation.ts)) picks for `runtime.state`, with fallbacks (e.g. knockdown → hitstun → idle) and crossfades; action states play once. The state machine drives animation, never the reverse: hit ranges and timing don't depend on the art. `LoadingScreen` preloads every glTF the config uses. Model files live in `public/models/` with their licenses in `public/models/LICENSE.md`; only add permissively licensed (e.g. CC0) assets.

### Side-scrolling stage and camera
The game is a 2.5D beat 'em up. [src/components/Stage.tsx](src/components/Stage.tsx) is a long strip from x = 0 to `stage.length` with a depth lane `stage.depthBand` (z), a back wall, and solid ends. [src/components/CameraRig.tsx](src/components/CameraRig.tsx) is side-on: its `camera` sim system (after `fighters`) follows the player with a horizontal dead zone and, unless `camera.allowBacktrack`, never scrolls back; the render loop places the camera and moves the shadow-casting light with it. The shared `StageView` (`cameraX`, `maxCameraX`, `halfWidth` of the visible area) lives in `GameScene`. Fighters are kept in bounds by `FighterBody`'s `getBounds`: the player stays on screen (`screenBounds`), enemies stay on the stage and in the lane (`stageBounds`). Fighters face only left or right; depth-only movement keeps the last side. The brawler AI walks to a spot level with the player in depth and beside it, and attacks only when within `enemy.attackRange` in X and `enemy.depthTolerance` in Z. Periodic spawns walk in from just off a screen edge. The math is in [src/sim/stage.ts](src/sim/stage.ts) with tests.

### Controls
[src/hooks/useControls.ts](src/hooks/useControls.ts) maps A/D (move left/right), W/S (move in depth), Space (jump), J (attack), K (block), Shift (dodge) to a boolean state object via window key listeners; lookups are lowercased, so map keys must be lowercase. It calls `e.preventDefault()` on mapped keys and clears all keys on window blur. Block and dodge are mapped but not implemented yet, so the on-screen hints leave them out. Escape (pause) is handled separately in `PauseMenu`, and H (hitbox overlay) in `HUD`.

### Levels, waves and screen locks
Enemies come from the level script, not a timer. A `Level` ([src/sim/level.ts](src/sim/level.ts)) is a list of segments; the stage length is the sum of their lengths (`levelLength`). Each segment holds triggers at an X offset: a `wave` trigger has one or more waves of spawn defs (`type`, `from` left/right/placed, optional `delay`, `depth`), optionally `lock`s the screen until all its waves are cleared, and a `goal` trigger ends the level. `stepLevel` is pure and tested (including a headless playthrough); it returns `lock`, `unlock`, `waveStart` and `complete` events. [LevelDirector.tsx](src/components/LevelDirector.tsx) runs it as the `level` sim system: it spawns enemies (left spawns come from the right at the stage start), sets `view.lockX` (the camera holds there while locked), shows the HUD wave label and "GO →" prompt via `levelProgress` in the store, and calls `completeLevel`. The demo level is `DEFAULT_LEVEL` in [src/config/levels.ts](src/config/levels.ts). Per-type health, scale, speed, aggression and color come from `DEFAULT_CONFIG.enemyTypes`.

Brawler enemies patrol until they first come within aggro range, then stay engaged; enemies off screen (walking in, or left behind by the camera) are always engaged, so a locked fight can't stall on an enemy wandering off screen.
