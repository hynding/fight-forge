# Plan: bosses

Status: **accepted** (2026-11-21; Steve took the recommended answer to every decision in section 8). Expands the Phase 6 stretch goal "Bosses: scripted phases and health-bar UI driven by level triggers" (picked by Steve on 2026-11-21) into three PRs. B1 (attack patterns and the boss fighter) is built; B2 and B3 are next. The choices only Steve can make are in [section 8](#8-decisions-for-steve).

## 1. Goal

A level can end in a boss fight: a big, named enemy with its own health bar across the bottom of the screen, a few distinct attacks, and phases that change how it fights as it loses health (faster, new attacks, calling in helpers). Creators build bosses in the Forge from the same parts as other enemies, with no code, and can test any phase in the sandbox.

## 2. Where we are today

What bosses can build on:

- **Enemy types** (`enemyTypes`, `EnemyTypeDef`): health, scale, speed, aggression, an AI archetype (`ai`), one `attackMove`, `armor` (super armor against light hits), `grabbable`, a drop, a model. A type with high health, big scale and armor is already a "mini boss", but it only has one attack and nothing changes as it's hurt.
- **AI** (`enemyIntent` in `src/sim/controllers.ts`): archetypes are data (`approach`, `reach`, `standOff`, `attackFrom`). Attacks are gated by the attack-token pool (`rules.maxSimultaneousAttackers`, default 1).
- **Level script** (`src/sim/level.ts`): segments with `wave` triggers (waves of spawns, optional screen lock) and a `goal`. `stepLevel` is pure and returns `lock`, `unlock`, `waveStart` and `complete` events; `LevelDirector` spawns and drives the HUD's wave label.
- **HUD**: health, meter, score, the wave label. Enemy health bars are small instanced bars over each enemy (M5.4).
- **Moves**: any frame data, `lunge`, knockdown, `throw`, sounds. The default pack's `shockwave` (a hitbox around the fighter) and `rushPunch` (a lunge) show that boss-style attacks are already possible as moves.

What's missing: several attacks per enemy and a way to choose between them, health-driven phases, a boss trigger with an intro and a big health bar, and Forge tools for all of it.

## 3. What a boss is

A boss is an **enemy type with a `boss` block**. Everything else about it (model, health, AI archetype, armor, drops) is the ordinary enemy type, so the existing Forge tools and the sandbox keep working.

```jsonc
"enemyTypes": {
  "DOCK_BOSS": {
    "maxHealth": 400, "scale": 1.6, "speed": 2.2, "aggression": 1.5,
    "ai": "brawler", "armor": 0.4, "grabbable": false,
    "attacks": [                                   // section 4, any enemy type can use it
      { "move": "bossSwipe",  "range": "near", "weight": 3 },
      { "move": "bossCharge", "range": "far",  "weight": 1, "cooldown": 4 }
    ],
    "boss": {
      "title": "BIG HARV",                         // shown on the intro card and the health bar
      "subtitle": "Dock foreman",
      "poise": 3,                                  // hits in a row before a knockdown can land (0 = normal)
      "phases": [
        { "below": 0.6, "speed": 2.8, "attacks": [ /* adds bossSlam */ ], "summon": { "enemies": [ { "type": "FAST", "from": "right" } ] } },
        { "below": 0.25, "speed": 3.2, "armor": 0.8, "taunt": "boss-roar" }
      ]
    }
  }
}
```

- **Phases** are ordered by health threshold (`below`: a fraction of max health). Each phase can change `speed`, `aggression`, `armor`, the AI archetype (`ai`), the `attacks` list, and the `model` tint, and can `summon` one wave of helpers. Fields a phase leaves out keep the previous phase's value.
- **Phase change**: when health first drops below a threshold, the boss finishes or cancels its move and becomes briefly invulnerable. Then it plays the phase's `taunt` sound, flashes, and pushes nearby fighters back (`boss.transition`: duration and push). The summon wave starts at the same time. A single big hit that crosses two thresholds plays both phase changes in order.
- **Poise**: bosses shrug off knockdowns until they've taken `poise` hits within a short window. This keeps the fight from becoming one long juggle while still letting combos stagger them. It builds on `armor`, which already handles light hits.
- **Defeat**: the last hit gets an extended hit-stop and slow motion (`feel.bossKo`), the boss's drop rolls as usual, and the boss trigger decides what happens next (section 5).

This is all data, checked by the registry like the rest of the pack. Phases are a short list of state changes, not a scripting language (decision 3).

## 4. Attack patterns (for every enemy type)

Today an enemy type has one `attackMove`. Bosses need several, and ordinary enemies benefit too, so this goes on every enemy type:

- `attacks`: a list of `{ move, range, weight, cooldown }`. `range` is `near` (inside the archetype's `reach`), `far` (outside reach but within `farReach`, for charges and projectiles later) or `any`.
- When the enemy gets an attack token, `pickAttack` (pure, `src/sim/attacks.ts`) chooses among the attacks that fit the current range and are off cooldown, weighted by `weight`. It uses a seeded random from the sim, so tests and replays are deterministic.
- `attackMove` stays as a shorthand for a one-entry list. Packs that use it don't change, so no migration is needed for old enemy types.
- The AI learns one new thing: a type with a `far` attack may attack from `farReach` instead of walking all the way in.

**Attack tokens**: by default a boss doesn't take a token from the shared pool. It has its own slot, so it can attack while one minion also attacks. That's the classic feel and stops a boss fight stalling behind a helper (decision 2). `boss.sharesTokens: true` opts back into the pool.

## 5. The boss trigger, intro and HUD

A new level trigger:

```jsonc
{ "kind": "boss", "at": 30, "enemy": "DOCK_BOSS", "from": "right", "depth": 0.5,
  "music": "boss-theme", "intro": true, "endsLevel": true }
```

- **Behaviour:**
  - It always locks the screen.
  - It spawns the boss and, with `intro`, shows a name card ("BIG HARV, Dock foreman") for about 1.5 s. The fight is frozen during the card, like the results overlay. Any button skips it.
  - It switches music while the boss is alive.
  - With `endsLevel` (the default), defeating the boss completes the level, with no need to walk to a goal. Remaining helpers are knocked out with the boss.
- **Pure level logic**: `stepLevel` gains `bossStart`, `bossPhase` and `bossDefeated` events. The headless playthrough test covers a boss level.
- **HUD**:
  - A wide boss health bar across the bottom of the screen with the title.
  - A tick for each phase threshold.
  - A delayed "damage taken" trail behind the bar, so big hits read clearly.
  - The small bar over the boss's head is hidden.
- **Results**: the results overlay gains a "Boss time" row.

## 6. Forge

- **Enemy types**:
  - A **BOSS** card (`BossTools`): a toggle to make the type a boss, title and subtitle, poise, and a phase editor drawn on a health bar.
  - In the phase editor, you drag a threshold to move it, click to add one, and each phase shows only the fields it changes (generated from the schema like the rest of the inspector).
- **Attacks**: an **ATTACKS** card on every enemy type. It has a row per attack (move, range, weight, cooldown) and shows the chance of each attack at near and far range.
- **Sandbox**: "Fight this boss" starts the sandbox with the boss alone, plus "from phase N" to start at a chosen phase's threshold, so a creator can test the last phase without beating the first two.
- **Level editor**: a **+ boss** toolbar button places a boss trigger (shown with a crown icon on the timeline). Its quick controls are the boss type, entry side, music, intro and ends-level. "Play from here" before a boss trigger plays the fight.

New schema fields get form editors automatically, and the existing coverage test keeps that true.

## 7. Milestones

Each is one PR, in order, with schema v9 introduced in B1.

| Id | PR | Contents | Done when |
| --- | --- | --- | --- |
| **B1** | Attack patterns and boss fighter | Schema v9:<br>• `attacks` on enemy types, `pickAttack` with seeded random and cooldowns, `far` attacks in the AI<br>• `boss` block (title, poise, phases, transition), phase changes and invulnerability, own attack slot, summons<br>• Pure tests for phases, poise and attack choice<br>• Forge ATTACKS card | An enemy type with three attacks uses all of them. A boss in the sandbox changes phase at its thresholds, summons helpers, and can't be juggled forever. |
| **B2** | Boss trigger, HUD and the default boss | • `boss` level trigger (lock, intro card, music, `endsLevel`) and `stepLevel` events<br>• Boss health bar with phase ticks and damage trail, boss KO slow motion, results row<br>• Default pack: a boss at the end of level 2 with three new moves | Level 2 ends in a boss fight that can be won with the default moveset. The headless playthrough test beats a boss level. |
| **B3** | Forge boss tools | • BOSS card with the health-bar phase editor<br>• "Fight this boss" from any phase<br>• Level editor boss trigger<br>• CLAUDE.md and the Forge help updated | A creator can make a new boss from an existing enemy type and test its last phase in under a minute, without touching JSON. |

B1 is useful on its own: ordinary enemies with several attacks make every level more varied. B2 needs B1. B3 needs B2's trigger for the level editor part, but its BOSS card could land with B1 if review prefers smaller PRs.

**Testing:** phases, poise, `pickAttack` and the boss level events are pure modules with Vitest tests. The registry tests cover threshold ordering, unknown moves in `attacks` and phases, and a boss trigger naming a non-boss type. A headless Playwright check beats the default boss without cheats, playing the combo and reading `sceneProbe.runtime`.

## 8. Decisions for Steve

*Decided by Steve on 2026-11-21: the recommended answer to each.* Recommendations first. Decision 1 shapes B2; the others can change later.

1. **Where the default pack's boss goes.** Recommended: one boss at the end of level 2 (the docks), with level 1 unchanged. A mid-boss in level 1 is easy to add later.
2. **Bosses and the attack-token limit.** Recommended: a boss has its own attack slot and always may attack. Helpers still share the pool, so with the default rules a boss and one helper can attack at once. The alternative (the boss waits for a token like everyone else) is safer for difficulty but can make the boss stand around.
3. **How far "scripted" goes.** Recommended: phases as data (thresholds that change stats, attacks and AI, plus a summon), not a timeline or scripting language. Timed events ("every 10 s, jump to the back and throw barrels") can come later as a phase field once there are projectiles.
4. **Projectiles.** Not in this plan. Bosses that throw things need a projectile system (moves that spawn a moving hitbox), which would also serve the "Weapons and throwables" stretch goal. Recommended: plan it with weapons, after bosses.
5. **Boss music.** Recommended: the default boss gets a new pattern track in the existing synth music format, so no audio files are added.
