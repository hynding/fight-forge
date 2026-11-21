# Plan: weapons and throwables

Status: **in progress**. Expands the Phase 6 stretch goal "Weapons and throwables: pickup items with their own movesets" (picked by Steve on 2026-11-21) into three PRs. Steve took every recommendation in [section 8](#8-decisions-for-steve) on 2026-11-21. W1 (projectiles) and W2 (weapons) are built; W3 is next.

## 1. Goal

Fighters can pick things up and fight with them. A lead pipe hits harder and further than a fist, a knife can be thrown across the screen, and a barrel can be lifted and hurled into a crowd. Enemies can carry weapons too, and drop them when knocked down. Bosses get ranged attacks (the projectiles the bosses plan left for later). Creators make all of it in the Forge, with no code.

## 2. Where we are today

What this builds on:

- **Moves** (`src/sim/moves.ts`): frame data, a hitbox in front of the attacker, reactions, `lunge`, `air`, and `throw` (launching a held enemy). Every hitbox is attached to its attacker; nothing flies on its own.
- **Movesets** (`src/sim/moveset.ts`): ordered rows of action, situation (`ground`, `air`, `running`, `blocking`, `grabbing`), direction and cost, first match wins. Grabbing already swaps in its own rows, which is the pattern a held weapon needs.
- **Thrown bodies** (`src/sim/grab.ts`, `GrabSystem`): a thrown enemy flies, knocks down the enemies it touches once each, and stops when it lands. This is a projectile in all but name, for fighters only.
- **Pickups** (`src/sim/pickups.ts`): heal or score items, placed by levels, dropped by enemies (`drop`) and breakable props. They are collected by walking over them.
- **Props** (`src/sim/props.ts`): boxes and cylinders, solid or not, breakable with a drop. They can't be picked up.
- **Enemy attacks** (B1): several attacks per type, chosen by range; `far` attacks fire from the archetype's `farReach`, today only as lunges.

What's missing: hitboxes that travel on their own, items that change how you fight while you hold them, and a way to pick up and throw stage objects.

## 3. Projectiles

A **projectile** is a hitbox with its own position and velocity, defined in a new content record, `projectiles`:

```jsonc
"projectiles": {
  "knife": {
    "shape": "box", "size": [0.5, 0.08, 0.08], "color": "#c0c8d0",  // or a glTF model
    "speed": 14, "lift": 0, "gravity": 0,                           // straight line
    "hitbox": { "halfX": 0.25, "halfY": 0.15, "halfZ": 0.3 },
    "damage": 12, "reaction": { "hitstun": 0.35, "knockback": { "x": 3, "y": 0 } },
    "lifetime": 1.2, "pierce": 0, "hitSound": "punch",
    "spin": 0                                                       // visual only
  }
}
```

- **Firing:** a move fires one with `projectile: { id, from: [x, y] }` as its active frames begin, the same moment a `throw` launches. `from` is an offset in front of the attacker. Any fighter can fire: the player from a moveset row, an enemy from its `attacks`.
- **Flight:** pure stepping in `src/sim/projectiles.ts` (position, velocity, gravity, lifetime), run by a `projectiles` sim system after `combat`. Projectiles are store-free scene state, like the summon queue, and drawn with one instanced mesh per shape.
- **Hits:** a projectile hits each target once, then stops, unless `pierce` lets it carry on. It uses the same rules as melee: guarding from the front blocks it with chip damage, dodging passes through, knocked-down fighters can't be hit, and boss poise applies.
- **Who it hits:** the player's projectiles hit enemies and breakable props. An enemy's projectile hits the player if the enemy held an attack token (or had its own slot) when it fired, so ranged enemies still respect the attacker limit. A projectile keeps that permission until it lands, even after the token is released.
- **Leaving the screen:** a projectile is removed when its lifetime runs out, it leaves the stage, or it hits the floor. A solid prop (a wall, a crate) stops it too.

As built in W1: shapes are `box`, `cylinder` and `sphere`; a glTF model for a projectile comes with W2, where a thrown weapon flies with its own model. A move that fires a projectile (like a throw) has a hitbox that hits nothing.

This is the system the bosses plan deferred (its decision 4): a boss attack can now be a `far` move that throws something.

## 4. Weapons

A **weapon** is a new content record, `weapons`, and a new pickup effect that places one on the ground:

```jsonc
"weapons": {
  "pipe": {
    "name": "Lead pipe", "kind": "melee",
    "model": { "kind": "prop", "shape": "cylinder", "size": [0.08, 1.0, 0.08], "color": "#8a8f96" },
    "hold": "hand",                       // or "overhead" for lifted objects
    "durability": 12,                     // hits it lands before it breaks (omit: never breaks)
    "moveset": [                          // replaces the player's attack rows while held
      { "action": "attack", "move": "pipeSwing" },
      { "action": "heavy", "move": "pipeSmash" },
      { "action": "attack", "when": "air", "move": "pipeAirSwing" }
    ],
    "throw": { "projectile": "pipeSpin" }, // what the grab button does with it
    "dropOn": "knockdown"
  },
  "knife": { "name": "Knife", "kind": "melee", "durability": 8, "moveset": [ … ], "throw": { "projectile": "knife" } },
  "barrel": { "name": "Barrel", "kind": "heavy", "hold": "overhead", "moveset": [], "throw": { "projectile": "barrel" } }
}
```

- **Picking up:** standing on a weapon and pressing attack picks it up instead of attacking (decision 1). The prompt over the item names the button.
- **Holding:** while held, the weapon's `moveset` rows are tried before the fighter's own (decision 2). Rows the weapon doesn't cover fall through, so jumping, grabbing and specials still work. A `heavy` weapon (a barrel) blocks attacks and slows walking until it is thrown.
- **Durability:** each hit a weapon's move lands uses one point. At zero the weapon breaks, with a sound and a puff of dust.
- **Dropping:** a knockdown makes the holder drop it at their feet (`dropOn`). The player can also put it down on purpose with grab while holding down (toward the camera).
- **Throwing:** the grab button throws the held weapon. Grab is already bound by default (O on the keyboard, right stick click on a pad) even when grabs are contact-only, and the on-screen help shows it while a weapon is held. Its `throw.projectile` flies with the weapon's model, and the weapon is gone unless the projectile's `returns` field makes it land as a pickup again (knives stay thrown; a pipe clatters to the floor).
- **Lifting stage objects:** a prop with `liftable: "barrel"` names the weapon it becomes. Grab next to it lifts it overhead, and grab again hurls it. Breakable props keep breaking as before (decision 4).
- **As built in W2:** a weapon's `throw` names a move (one that fires a projectile) rather than a projectile, and `returns` sits on the weapon's `throw`. A heavy weapon's `walkFactor` (default 0.6) sets how much it slows walking. A lifted prop with no pickup form (the barrel) is gone if its holder is knocked down. Lifting uses `rules.pickupRadius` as its reach.
- **Enemies:** an enemy type can start with a `weapon`. It uses the weapon's moves in place of its `attacks` while armed, drops it when knocked down, and the player can take it (decision 3). Enemies don't pick weapons up from the floor in this plan.

## 5. HUD and feel

- **Player:** a small icon for the held weapon under the health bar, with a durability bar.
- **Items:** a weapon on the floor gets a soft glow and the pick-up prompt when the player is near it.
- **Feel:** projectile hits use the existing hit-stop, sparks and rumble. A weapon breaking shakes the camera a little and plays `audio.break` (a new event sound, synth by default).

## 6. Forge

- **Projectiles:** a PROJECTILE card with a side view that draws the flight path (speed, lift, gravity, lifetime) and the hitbox along it, and a "▶ Try it" button that fires it in the sandbox.
- **Weapons:** a WEAPON card that previews the model in hand, edits its moveset with the existing moveset table, and has a "▶ Fight with it" sandbox that starts the player holding the weapon.
- **Moves:** the move inspector gains `projectile`, shown on the frame timeline as the moment it fires.
- **Levels:** pickups already have a toolbar button, and weapon pickups show up in its list with their own icon. Props marked `liftable` get a ⤒ badge on the timeline.
- **Enemies:** the enemy type form gets `weapon`, and the ATTACKS card shows the weapon's moves while armed.

New schema fields get form editors automatically, and the coverage test keeps that true.

## 7. Milestones

Each is one PR, in order. Schema v11 is introduced in W1 and v12 in W2.

| Id | PR | Contents | Done when |
| --- | --- | --- | --- |
| **W1** | Projectiles | • Schema v11: `projectiles` record, move `projectile`<br>• `src/sim/projectiles.ts` (pure, tested) and the `projectiles` sim system, instanced drawing<br>• Token rules for enemy projectiles, blocking, dodging, poise<br>• Default pack: a knife-throwing enemy type (THROWER, a `far` knife attack) in level 1, and BIG HARV's last phase throws barrels<br>• Forge PROJECTILE card | THROWER throws knives from far range that can be blocked and dodged, and HARV's barrels fly in phase 3. Unit tests cover flight, hits, pierce and token rules. |
| **W2** | Weapons | • Schema v12: `weapons` record, weapon pickups, enemy `weapon`, prop `liftable`<br>• Pick up, hold (weapon moveset first), durability, drop on knockdown, throw, lift and throw props<br>• HUD weapon icon and durability, pick-up prompt<br>• Default pack: lead pipe and knife placed in both levels and in some crates; barrels become liftable; a few enemies start armed | The player can pick up the pipe, use its moves until it breaks, take a knife from an enemy and throw it, and throw a barrel into a group. The headless check does each of these. |
| **W3** | Forge weapon tools | • WEAPON card with the in-hand preview and moveset table<br>• "▶ Fight with it" sandbox, and "▶ Try it" on the PROJECTILE card<br>• Level editor weapon icons and liftable badges<br>• CLAUDE.md updated | A creator can make a new throwable weapon from an existing projectile and try it in the sandbox in under a minute, without touching JSON. |

W1 is useful on its own: ranged enemies and boss projectiles. W2 needs W1 for throwing. W1 shipped the PROJECTILE card with its flight-path side view; its "▶ Try it" lands with W3's weapon sandbox.

**Testing:** projectile flight and hits, weapon moveset precedence, durability, drops and lifting are pure modules with Vitest tests. Registry tests cover unknown projectiles, weapons and moves, a weapon pickup naming a missing weapon, and a liftable prop naming a non-weapon. Headless Playwright checks pick up, use, break and throw weapons with the default controls.

## 8. Decisions for Steve

Recommendations first. Decisions 1 and 2 shape W2; the others can change later. **Decided 2026-11-21: Steve took all five recommendations.**

1. **How to pick a weapon up.** Recommended: press attack while standing on it, the classic arcade way, with no new button. Alternatives: walk over it to pick it up automatically (easy, but you can't walk past a weapon you don't want), or a dedicated pick-up button.
2. **How a weapon's moves combine with yours.** Recommended: the weapon brings its own moveset rows, tried before yours, so a pipe combo replaces the punch combo but jumping, grabbing and specials still work. The alternative is `when: "armed"` rows in the player's own moveset, which is more flexible for one pack but means every weapon fights the same way.
3. **Enemies and weapons.** Recommended: some enemy types start armed and drop their weapon when knocked down, and the player can take it. Enemies picking weapons up from the floor would need new AI and can come later.
4. **Lifting stage objects.** Recommended: in W2, props can be marked `liftable` (barrels, crates) and thrown like weapons. The alternative is to leave props as they are and ship only hand-held weapons.
5. **Default content.** Recommended: a lead pipe and a knife, a knife-throwing enemy in level 1, liftable barrels, and barrel throws in BIG HARV's last phase. All are built from boxes and cylinders with synth sounds, so no new model or audio files are needed.
