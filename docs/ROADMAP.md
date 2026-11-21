# Fight Forge Roadmap

**Goal:** a scrollable 3D brawler that creators can customize and configure to fit the gameplay they want.

This document plans the path from the code as it stands (after PR #3) to that goal. It is split into phases, and every milestone is sized to land as one pull request that leaves `npm run lint`, `npm test`, and `npm run build` green and the game playable.

---

## 1. Where the code is today

What exists and works well:

- **A solid runtime skeleton.** React 18 + Vite + `@react-three/fiber` + Rapier physics + zustand. Screen flow (menu, loading, playing), pause, game over, and restart (`gameId` remount) all work.
- **Performance discipline.** Per-frame data lives in rigid-body refs, not React state. Shared vectors are module-scoped. Gameplay timers are game time, stepped with `gameStep(delta)`.
- **Basic combat.** One player attack (cone check, range 3, 20 damage, one hit per swing), three enemy types (BASIC / FAST / HEAVY), and the single-attacker rule via `attackingEnemyId`.
- **Enemy AI.** Aggro, chase, spacing repulsion, circling while waiting for the attack slot, and patrol.
- **Tests** for the store, controls mapping, and `gameStep`.

What stands between it and the goal:

| Gap | Today | Needed |
| --- | --- | --- |
| Scrolling | Top-down 30x30 walled arena; WASD moves on the full X/Z plane; camera hovers above | Side-on camera that scrolls along a long level, with a shallow depth lane (belt-scroller style) |
| Levels | None; endless random spawns every 5s up to 8 | Ordered level segments, screen locks, scripted waves, a goal, level complete |
| Combat depth | One attack, no hitstun, knockback, combos, block, dodge, or air attacks | Moves with frame data (startup / active / recovery), hitboxes, hit reactions, combos |
| Player vs enemy code | Two separate components with duplicated movement, facing, and model logic | One `Fighter` entity driven by either an input or an AI controller |
| Configuration | Tuning is hard-coded constants spread over `Player.tsx`, `Enemy.tsx`, `CombatSystem.tsx`, `GameScene.tsx`; enemy kinds are a TS `enum` | All gameplay values come from validated data |
| Content | Procedural box humanoid only; colors and scales by `switch` on enemy type | Characters, moves, enemies, levels, and rules as content that creators can add |
| Creator tooling | None | An in-browser editor ("Forge mode") with live preview and import/export |
| Project hygiene | No CI | CI running lint, test, and build on every PR |

There is also an unmerged `copilot/create-brawler-engine-framework` branch. It is a separate 2D, DOM-rendered engine on a different stack and shares no code with `main`. This plan does not build on it, and Steve has decided to delete it (section 6).

---

## 2. Product shape (the assumptions this plan makes)

- **Genre:** a 2.5D side-scrolling beat 'em up. The camera looks at the action from the side and slightly above. Fighters move freely left/right along the level (X) and within a shallow depth band (Z, e.g. 6 units). The level scrolls as the player advances, and "screen locks" hold the camera until a wave is cleared.
- **Creators:** people who want to make their own brawler without writing code. They edit data (characters, moves, enemies, levels, rules) in an in-browser editor and share a **content pack** (JSON plus assets such as imported 3D models) online, where other players can browse, play, and remix it.
- **Art:** imported 3D character models (glTF) come in early, in Phase 1. The procedural box humanoid stays as a fallback and placeholder.
- **Developers** can still extend the engine in code (new AI behaviors, new move effects), and those extensions become new options in the data.
- **Single player first.** Local co-op is a stretch goal, but the architecture below keeps it possible (no "the player" singletons in combat code).

All of these were confirmed by Steve (section 6).

---

## 3. Target architecture

### 3.1 Layers

```
content/ (JSON packs)  ──►  src/content/ (schemas, loader, registry)
                                   │  validated, typed definitions
                                   ▼
src/sim/  (pure TS, no React)  ── systems stepped at a fixed 60 Hz:
  input → controllers (player input / AI) → fighter state machines
        → movement → hit detection → damage & reactions → spawning / level script
                                   │  reads/writes Rapier bodies via refs
                                   ▼
src/components/ (R3F)  ── render only: models, VFX, camera, HUD, editor UI
src/store/             ── UI-facing state (screen, pause, health, score, level progress)
```

Key changes from today:

1. **Content layer.** Every tunable value is defined by a schema (recommend `zod`, so TS types are derived from the schema and invalid packs produce readable errors). A `ContentRegistry` resolves ids (`fighter:brawler`, `move:jab`) to definitions. The current constants become the **default pack**.
2. **Simulation layer separate from React.** Gameplay logic moves out of component `useFrame`s into plain TS systems, driven by one `useFrame` that runs a fixed-step accumulator (60 Hz, built on `gameStep`). This gives a predictable system order, frame-exact move timing for frame data, and logic that is unit-testable without WebGL. Components keep doing what they are good at: rendering and owning Rapier bodies.
3. **`Fighter` entity + controllers.** Player and enemies share one fighter model: stats, a state machine (`idle`, `walk`, `jump`, `attack(move)`, `block`, `dodge`, `hitstun`, `knockdown`, `getup`, `dead`), facing, and a current move. A controller produces intents (move vector, attack, jump, block, dodge): `InputController` from the keyboard / gamepad, `AIController` from an AI behavior. Two players later means two `InputController`s.
4. **Moves with frame data.** A move is data: animation, startup / active / recovery frames, hitboxes per active window (offset + size, relative to facing), damage, knockback vector, hitstun, cancel windows into other moves. Hit detection is pure math on boxes (cheap and testable) rather than physics sensors.
5. **Attack tokens.** The `attackingEnemyId` invariant generalizes to an attack-token pool with `rules.maxSimultaneousAttackers`, **defaulting to 1**, so today's balance rule stays the default and becomes a creator setting. The live-read rule (read current state per frame, not a stale selector) carries over, and CLAUDE.md is updated in the same PR.
6. **Level runtime.** A level is an ordered list of segments, each with a length, environment props, and triggers (`onEnter`, `onCameraReach`, `onWaveCleared`) that spawn waves or lock the camera. The camera follows the player with a dead zone and is clamped by the active segment / lock bounds.
7. **Store split into slices.** `session` (screen, pause, active pack), `run` (score, lives, level index), `combat` (fighter HUD data keyed by id with a `defId`), `forge` (editor workspace). Per-frame data still never goes into the store.
8. **Asset pipeline.** A `ModelRef` is either the procedural humanoid or a glTF/GLB file with a clip map from fighter states and moves to animation clip names. Fighter states drive animation (via drei `useAnimations`), never the other way round: hitboxes stay data, not mesh-derived, so gameplay doesn't depend on the art. Models load through Suspense behind the loading screen.
9. **Online pack service.** Sharing needs a small backend: accounts, pack storage (JSON + assets), and a catalog API. Packs are **data only** (no scripts), and the same schema validation runs on upload and on download, so a shared pack can't run code in a player's browser. The service lives in its own folder (e.g. `server/`) with its own deploy, and the game stays a static site that works offline with local packs.

### 3.2 Content model (first draft)

```ts
Pack      { id, name, version, schemaVersion, meta: { author, description, cover?, license },
            fighters[], moves[], enemies[], levels[], rules, theme?, assets: AssetRef[] }
AssetRef  { id, kind: 'model'|'texture'|'audio', path /* inside the pack bundle */, hash, bytes }
ModelRef  { kind: 'procedural', color } | { kind: 'gltf', asset: AssetId, scale, offset, clips: Record<StateOrMoveId, ClipName> }
Fighter   { id, name, model: ModelRef, scale, stats: { maxHealth, walkSpeed, depthSpeed, jumpVelocity, weight },
            moveset: { light: MoveId[] /* combo chain */, heavy?, jumpAttack?, dashAttack?, special? }, colors? }
Move      { id, animation, startup, active, recovery /* frames @60Hz */, hitboxes: Hitbox[], damage, knockback: [x,y],
            hitstun, launches?, cancelInto?: MoveId[], cancelWindow?: [from,to], movement?: [x,z] }
Enemy     { id, fighter: FighterId, ai: { behavior: 'brawler'|'rusher'|'tank'|…, aggroRange, aggression,
            preferredRange, retreatChance }, score, drops? }
Level     { id, name, theme, segments: Segment[], music? }
Segment   { length, depthBand?, props: Prop[], triggers: Trigger[] }
Trigger   { at: number /* x offset */, kind: 'wave'|'cameraLock'|'pickup'|'goal', waves?: Wave[] }
Rules     { lives, continues, maxSimultaneousAttackers, friendlyFire, difficulty: { damageMult, healthMult },
            camera: { height, distance, fov, deadZone }, scoring, inputBindings }
```

`schemaVersion` plus a small migration table means packs made with older versions keep loading. A shared pack is a bundle (zip) of the JSON plus its asset files, referenced by relative path and checked by hash.

---

## 4. Phases and milestones

Each milestone below is one PR. "Done when" is the acceptance bar. Every PR keeps the game playable and adds tests for the pure logic it introduces.

### Phase 0: Foundations (no visible gameplay change)

**M0.1 CI and housekeeping**
- GitHub Actions workflow running `npm ci`, `lint`, `test`, `build` on PRs.
- Replace the one-line README with what the game is, how to run it, and a link to this roadmap.
- Done when: CI is required-green on a test PR.

**M0.2 Extract tuning into a typed defaults config**
- Move every gameplay constant (speeds, jump, attack range/cone/damage/timings, enemy stats per type, spawn interval/cap, camera offsets, scoring) into `src/config/defaults.ts` with a `GameConfig` type. Components read from it.
- Replace the `switch (type)` blocks in `Enemy.tsx` with a per-type definition record.
- Done when: no gameplay literals remain in components; behavior is identical; a test snapshots the defaults.

**M0.3 Fixed-step simulation loop**
- Add `src/sim/loop.ts`: one accumulator stepping registered systems at 60 Hz, honoring pause / game over and `gameStep`'s clamp.
- Port `CombatSystem`, the spawner, and the attack-slot timers onto it, keeping behavior the same. Player and enemy movement can move in M1.1.
- Done when: system order is explicit and tested (e.g. "combat sees a swing on the frame it starts"), and gameplay is unchanged.

### Phase 1: Side-scrolling gameplay core

**M1.1 Unified `Fighter` entity and controllers**
- `src/sim/fighter.ts`: fighter state machine and intents; `InputController` (wraps `useControls`) and `AIController` (today's enemy AI ported as the `brawler` behavior).
- One `<FighterBody>` component replaces the duplicated parts of `Player.tsx` and `Enemy.tsx` (rigid body, facing, model, hurt flash).
- Done when: player and enemies run through the same code path; state-machine transitions are unit-tested; play feel unchanged.

**M1.2 Imported 3D character models**
- `ModelRef` (section 3.2) with glTF/GLB loading via drei `useGLTF` / `useAnimations`; the fighter state machine from M1.1 selects clips (idle, walk, jump, hurt, knockdown, attack) through the clip map, with crossfades.
- Ship one permissively licensed (e.g. CC0) rigged sample character for the player and one for enemies under `public/models/`, with the license recorded next to them. The box humanoid stays as the fallback when a model is missing or fails to load.
- Collider size and model offset come from the fighter definition rather than the hard-coded `-0.35` offset.
- Done when: the player and enemies render as imported animated models that follow fighter state; a missing model falls back cleanly; clip-map resolution is unit-tested.

**M1.3 2.5D movement plane and scrolling camera**
- Movement: X free, Z clamped to the level's depth band. Facing flips left/right (with depth movement keeping the last horizontal facing).
- Camera: side-on follow with a configurable height, distance, and horizontal dead zone; never scrolls backward past the left bound.
- Replace the walled arena with a long ground strip; enemies enter from off-screen edges.
- Update controls (A/D horizontal, W/S depth) and the on-screen hints.
- Done when: you can walk a long strip with the camera scrolling; camera math is tested as a pure function.

**M1.4 Level runtime: segments, waves, screen locks, goal**
- `src/sim/level.ts`: segments, triggers, wave spawning (replacing the timer spawner), camera locks that release on wave clear, a "GO →" prompt, and a goal trigger.
- Store gets `levelProgress`; new `levelComplete` screen.
- Ship one hand-written level as a TS data object shaped like the future schema.
- Done when: a level can be played start to finish; trigger and wave logic are tested headless.

**M1.5 Moves with frame data, hitboxes, and hit reactions**
- Move definitions with startup / active / recovery; hitbox checks against hurtboxes as pure math; one-hit-per-move-instance (generalizing `damagedEnemiesThisAttack`).
- Reactions: hitstun, knockback, knockdown + getup, brief invulnerability on getup.
- Light-attack combo chain (e.g. jab, jab, hook, finisher with launch) via cancel windows.
- Each move names its animation clip; active frames line up with the clip so hits read correctly on imported models.
- Hitbox debug overlay (toggle) for tuning.
- Done when: the cone check is gone; combo timing and hit detection are covered by tests.

**M1.6 Block, dodge, jump and dash attacks**
- Implement the already-mapped K (block) and Shift (dodge): block reduces damage and causes blockstun; dodge is a short invulnerable sidestep in depth.
- Jump attack and dash (double-tap) attack as moves.
- Restore block/dodge to the on-screen hints.
- Done when: each new action is a move/state in data, not a special case.

**M1.7 Enemy AI archetypes and attack tokens**
- Replace `attackingEnemyId` with an attack-token pool (`maxSimultaneousAttackers`, default 1) keeping the "release only if you still hold it" and recovery rules; update CLAUDE.md.
- AI behaviors as small composable strategies: `brawler` (today), `rusher` (dash-in hits), `tank` (slow, armored, ignores light hitstun), `flanker` (circles behind). Parameters come from enemy definitions.
- Done when: behaviors are selectable per enemy definition; token fairness is tested.

**M1.8 Game flow: lives, pickups, results**
- Lives and continues from rules; respawn with invulnerability.
- Pickups (health food, score items) placed by level triggers or dropped by enemies.
- Results screen (score, time, KOs) and a level select listing the pack's levels.
- Done when: a multi-level run with lives works end to end.

**Phase 1 exit:** a short, complete side-scrolling brawler built from the default content, still defined in TS.

### Phase 2: Data-driven content

**M2.1 Content schemas and registry**
- Add `zod`; define schemas for pack, fighter, move, enemy, level, rules (section 3.2); derive TS types from them.
- `ContentRegistry` with id resolution and cross-reference validation (a fighter's moveset points at real moves, etc.), returning a readable error list.
- Done when: schemas and the registry have thorough tests, including bad-pack cases.

**M2.2 Default pack as JSON**
- Move `src/config/defaults.ts` and the Phase 1 TS content into `content/default/*.json`, loaded and validated at boot (the loading screen becomes real).
- Done when: no gameplay definitions remain in TS code; the game plays identically from JSON.

**M2.3 Pack bundles: load, override, version**
- Load an extra pack from a file picker or URL; a pack can add content or override defaults by id.
- `schemaVersion` with a migration table.
- Pack bundles: zip import / export of the JSON plus asset files (models, textures), with per-type size limits and hash checks. This is the same format the online service will store.
- Start menu: choose a pack.
- Done when: a sample "remix" pack that changes stats, swaps in a different character model, and adds a level loads and plays from a single bundle file.

**M2.4 Rules and input configuration**
- All `Rules` fields wired in (lives, difficulty multipliers, attackers, friendly fire, camera, scoring).
- Remappable input bindings (still lowercase keys, per CLAUDE.md), stored per pack with a user override in local storage.
- Done when: every rules field changes gameplay and has a test or visible check.

**M2.5 Level themes and props**
- Theme definitions: ground material, backdrop layers with parallax, lighting, fog, sky color.
- A prop library (crates, barrels, walls, platforms) placeable from level data, some breakable with drops.
- Done when: two visually distinct themes ship in the default pack.

**Phase 2 exit:** everything a creator would want to change is data, and a pack can be swapped without touching code.

### Phase 3: Creator tools ("Forge mode")

An in-app editor reachable from the start menu, as a new `gameScreen: 'forge'`. It edits the same schemas the game loads, so there is one source of truth.

**M3.1 Forge shell and pack workspace**
- Forge screen layout (asset list, inspector panel, preview viewport); create / duplicate / rename packs.
- Persist the workspace (JSON and asset files) in IndexedDB; import and export pack bundles.
- Schema-driven form generation for any definition, with inline validation errors from the registry.
- Done when: you can create a pack, edit a fighter's stats in a form, export it, and load it in the game.

**M3.2 Fighter, model, and move editor**
- Import a glTF/GLB model for a fighter, preview it, and map its animation clips to states and moves from dropdowns.
- Preview viewport showing the fighter; play any move with a frame scrubber; hitboxes drawn and draggable per active frame.
- Combo-chain editor for the moveset.
- Done when: a creator can author a new move and see its hitbox and timing without leaving the editor.

**M3.3 Enemy editor and sandbox**
- Enemy definitions with AI parameters as sliders; a sandbox arena to spawn N of any enemy and fight them right away.
- Done when: tuning an enemy and testing it takes seconds.

**M3.4 Level editor**
- Side-view timeline of segments; place props, spawn triggers, waves, camera locks, pickups, and the goal by dragging.
- "Play from here" launches the level at the cursor.
- Done when: a creator can build a full level from scratch in the editor.

**M3.5 Rules, controls, and pack metadata editors**
- Forms for rules, bindings, title, author, description, and cover image.
- Done when: every field of a pack can be edited in Forge.

**M3.6 Playtest loop with live reload**
- Toggle between Forge and play with the edited pack, keeping the camera position; edits apply on return without a full reload where possible.
- Done when: the edit, play, adjust loop has no export/import step.

**Phase 3 exit:** a non-programmer can make a complete brawler, with their own models, and export it as a bundle.

### Phase 4: Online sharing

Packs become shareable online. This is the first phase with a server, so it starts with a decision record.

**M4.1 Backend decision and public deploy**
- ADR choosing the backend. Recommend a managed backend-as-a-service (for example Supabase: Postgres, auth, and object storage in one) over a custom server, to keep cost and upkeep low; record the alternatives considered.
- Deploy the game itself as a static site (e.g. GitHub Pages or Vercel) from CI, so a shared link has somewhere to open.
- Done when: the ADR is merged and the game is live at a public URL.

**M4.2 Accounts and publishing**
- Sign-in; publish a pack from Forge (bundle upload with server-side schema validation, asset type and size limits, and a declared license for its assets); versioned updates of your own packs; public, unlisted, or private visibility.
- Done when: a creator can publish a pack from Forge and update it to a new version.

**M4.3 Browse, play, and share links**
- An in-game gallery (search, sort, cover images, author pages); play a pack directly with local caching; deep links (`?pack=<id>`) that open straight into a pack.
- Done when: a second account can find a published pack, play it, and share a link that opens it.

**M4.4 Remix and community basics**
- "Remix" copies a published pack into your Forge workspace with attribution back to the original; likes or ratings; "updated" badges for packs you've played.
- Done when: remixing keeps attribution and the original is unaffected.

**M4.5 Safety and moderation**
- Report a pack, owner and admin takedown, upload rate limits, and checks on uploaded assets (file types, size, glTF validation).
- Done when: a reported pack can be hidden by an admin, and limits are enforced server-side.

### Phase 5: Feel and polish

**M5.1 Audio**
- SFX per move / hit / block / KO and music per level, configured in the pack and bundled as assets; master / music / SFX volume settings.

**M5.2 Game feel**
- Hit-stop, screen shake, hit sparks and dust particles, damage numbers; each configurable (and turn-off-able) in rules.

**M5.3 Extended controls** (planned in [plans/extended-controls.md](plans/extended-controls.md), split into PRs C1–C6)
- C1 input layer (per-step action sampling, no dropped taps), C2 per-device bindings (keyboard, mouse, gamepad; schema v4), C3 gamepad (analog movement, button labels, rumble, menu navigation), C4 data-driven movesets (action + situation + direction triggers), C5 heavy attack and special, C6 grabs and throws.
- Packs choose which optional actions are on and their default buttons per device; players remap per device on the start menu.

**M5.4 Performance pass**
- Instanced rendering for crowds, skinned-mesh budgets for imported models, a stress level (30+ enemies), and a frame-time budget check.

### Phase 6: Stretch goals

- **Local co-op**: a second `InputController` and HUD; camera framing for two players.
- **Weapons and throwables**: pickup items with their own movesets.
- **Bosses**: scripted phases and health-bar UI driven by level triggers. Planned in [plans/bosses.md](plans/bosses.md) (B1–B3).
- ~~Grabs and throws, and specials with a meter~~: moved into M5.3 (C5, C6).
- **Online co-op**: much larger than local co-op (netcode); only worth planning once the fixed-step sim has proven deterministic.

---

## 5. Cross-cutting practices

- **Tests:** every `src/sim` and `src/content` module is pure TS with unit tests (Vitest, no DOM needed, matching today's setup). Add a Playwright smoke test (boot, start a level, take a hit) in Phase 1 once there is a level to play.
- **Invariants:** keep the existing CLAUDE.md rules (refs for per-frame data, live store reads in per-frame code, game-time timers via `gameStep`, `setLinvel`-based movement feel). Any PR that changes one updates CLAUDE.md in the same PR.
- **Default pack as the regression suite:** once content is data, a headless test loads the default pack and validates it, and a sim test plays a scripted input sequence through the first wave.
- **Small PRs:** if a milestone grows past roughly 600 changed lines of non-test code, split it.

---

## 6. Decisions

All settled by Steve on 2026-11-20:

1. **Camera and movement:** a classic 2.5D beat 'em up. Fighters move left/right along the level plus a shallow depth lane, and the camera scrolls as the player advances.
2. **Who are the creators?** Non-programmers using the in-app Forge editor.
3. **Sharing:** packs are shareable online. This adds Phase 4 (backend, accounts, gallery, moderation).
4. **Art direction:** imported 3D models early. This moves model support into Phase 1 (M1.2) and makes assets part of the pack format from Phase 2.
5. **The `copilot/create-brawler-engine-framework` branch:** delete it. It is an unrelated 2D DOM engine that this plan doesn't build on.

---

## 7. Suggested order at a glance

| # | PR | Phase |
| --- | --- | --- |
| 1 | M0.1 CI and housekeeping | 0 |
| 2 | M0.2 Tuning into typed defaults | 0 |
| 3 | M0.3 Fixed-step simulation loop | 0 |
| 4 | M1.1 Unified Fighter + controllers | 1 |
| 5 | M1.2 Imported 3D character models | 1 |
| 6 | M1.3 2.5D plane + scrolling camera | 1 |
| 7 | M1.4 Level runtime | 1 |
| 8 | M1.5 Moves, hitboxes, reactions | 1 |
| 9 | M1.6 Block, dodge, air/dash attacks | 1 |
| 10 | M1.7 AI archetypes + attack tokens | 1 |
| 11 | M1.8 Lives, pickups, results | 1 |
| 12 | M2.1 Schemas + registry | 2 |
| 13 | M2.2 Default pack as JSON | 2 |
| 14 | M2.3 Pack bundles, loading, versioning | 2 |
| 15 | M2.4 Rules + input config | 2 |
| 16 | M2.5 Themes + props | 2 |
| 17 | M3.1 Forge shell + workspace | 3 |
| 18 | M3.2 Fighter / move / model editor | 3 |
| 19 | M3.3 Enemy editor + sandbox | 3 |
| 20 | M3.4 Level editor | 3 |
| 21 | M3.5 Rules / metadata editors | 3 |
| 22 | M3.6 Live playtest loop | 3 |
| 23 | M4.1 Backend ADR + public deploy | 4 |
| 24 | M4.2 Accounts + publishing | 4 |
| 25 | M4.3 Gallery, play, share links | 4 |
| 26 | M4.4 Remix + community basics | 4 |
| 27 | M4.5 Safety + moderation | 4 |
| 28+ | Phase 5 and 6 | 5–6 |

Phases 2 and 3 can partly overlap with late Phase 1 work: M2.1 (schemas) only needs the shapes settled in M1.4 and M1.5, so it can start once those land. M4.1 (the backend decision) can be written any time after M2.3 fixes the bundle format.
