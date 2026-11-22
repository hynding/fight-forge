# Plan: local co-op (two players)

Status: **planned**. Expands the Phase 6 stretch goal "Local co-op: a second `InputController` and HUD; camera framing for two players" (picked by Steve on 2026-11-22) into three PRs. The decisions in [section 8](#8-decisions-for-steve) are open.

## 1. Goal

Two people play a level together on one screen, the way arcade beat 'em ups are played: the second player presses a button to join at any time, each player has their own health, lives, score and weapon, the camera keeps both in view, and enemies split their attention between them. Creators tune co-op (enemy scaling, friendly fire, player 2's colour) in the Forge like everything else. Online co-op is not part of this plan.

## 2. Where we are today

The roadmap kept co-op possible: player and enemies share one fighter body (`FighterBody`), a controller produces each fighter's intent, enemy AI already moves toward a `target`, and combat runs over a `runtimes` Map rather than a hard-coded player. What is still single-player:

- **Store:** `playerHealth`, `playerMaxHealth`, `lives`, `continuesLeft`, `meter`, `respawnCount`, `playerWeapon` and `score` are one value each. `damagePlayer`, `healPlayer`, `spendHealth`, `gainMeter` and `spendMeter` take no player.
- **Scene:** `GameScene` owns one `playerRef` and one `playerPositionRef`, read by CombatSystem, Projectiles, GrabSystem, HeldWeapons, Pickups, LevelDirector, CameraRig, ModelBudgetDriver and the enemy AI. The player's runtime is registered as `"player"`, and `landHit`, CombatSystem, Projectiles and GrabSystem compare against that one name (`PLAYER`).
- **Enemy rules:** the AI targets the one player. Attack tokens are one pool (`rules.maxSimultaneousAttackers`, default 1), and an enemy projectile's `hurtsPlayer` is a yes or no.
- **Input:** one `InputManager` per scene samples the keyboard, the mouse and player 1's pad (`activePadIndex`: the first pad that pressed something). The default keyboard map puts movement on both WASD and the arrow keys.
- **Camera and bounds:** the camera follows the one player with a dead zone; `screenBounds` keeps that player on screen.
- **HUD and results:** one health bar, lives, meter, weapon box and score.

## 3. Players in the game

- **Who's playing:** the store gets a `players` list, one entry per joined player: `{ slot: 1 | 2, health, maxHealth, lives, meter, score, kos, weapon, respawnCount, device }`. Today's single-player fields become player 1's entry. Each player's fighter runtime registers as `p1` or `p2`.
- **Joining (decision 1):** player 2 joins by pressing attack or start on a device nobody is using: a second pad, or the keyboard when player 1 is on a pad. They drop in mid-screen, invulnerable for a moment, like a respawn. At the start menu, "1 PLAYER / 2 PLAYERS" sets who is expected, but drop-in works either way.
- **Devices (decision 2):** each player has their own `InputManager` reading only their device. Recommended setups: keyboard + pad, or two pads. Two players on one keyboard is supported with a second keyboard map, `input.bindings.keyboard2` (default: arrow keys to move, and the number pad for jump, attack, block and the rest). While player 2 uses the keyboard, the arrow keys leave player 1's map so they don't drive both fighters.
- **Player 2's look:** the same fighter definition as player 1 (`settings.player`), recoloured with `coop.p2Color`. A pack can give player 2 a fighter of its own with `coop.p2Fighter` (decision 5).
- **Leaving:** a player who runs out of lives and continues drops out, and their device can join again by spending a continue. The game is over only when every player is out.

## 4. Fighting together

- **Enemy targets:** each enemy targets the nearest living player, re-checked a few times a second with a margin in favour of its current target, so it doesn't flip-flop at equal distances. Bosses do the same.
- **Attack tokens (decision 3):** recommended: `maxSimultaneousAttackers` applies per player, so each player faces at most one attacker at a time by default and two players face two. A token is taken against a target; `hurtsPlayer` becomes the slot of the player it may hit.
- **Friendly fire:** players' hits don't hurt each other unless `coop.friendlyFire` is on. Thrown enemies and projectiles follow the same rule.
- **Enemy scaling (decision 4):** with two players, enemy health is multiplied by `coop.enemyHealth` (default 1.5). Waves keep the same enemies, so levels play the same and creators don't have to script two versions.
- **Shared stage:** a weapon on the floor goes to whoever presses attack on it first; pickups go to whoever walks over them; a heal pickup heals only that player. Each player's grab, weapon, meter and special work as in single player. A held enemy can't be grabbed by the other player.
- **Score:** each player has their own score, KOs and continues used. The results screen shows both and a team total.

## 5. Camera and screen

- **Framing:** the camera follows the midpoint of the living players with the same dead zone, and never scrolls back unless `camera.allowBacktrack`.
- **Leash:** both players stay on screen (`screenBounds` per player). The camera can't scroll forward while the player furthest behind is at the left edge, so the leader waits, as in the arcade games.
- **Locks:** a screen lock holds both players inside the locked view, as it holds one today.
- **Respawns:** a player who loses a life drops back in beside the other player if they are alive, or mid-screen if not.

## 6. HUD, menus and Forge

- **HUD:** player 1's health, lives, meter and weapon top left; player 2's top right, or "PRESS ⟨attack⟩ TO JOIN" (from `deviceHelp`, naming the free device's button) while the slot is empty. The boss bar moves to the bottom when two players are in.
- **Start menu:** "1 PLAYER / 2 PLAYERS". The CONTROLS panel gets a Player 2 tab for `keyboard2` remapping and pad assignment ("press a button on player 2's controller").
- **Pause:** either player's pause button pauses. Pausing on a disconnected pad works as today, for both players' pads.
- **Forge:** `coop` settings (enemy health, friendly fire, player 2 colour and fighter) use the generated form. The Bindings card gets a Keyboard 2 tab. Sandboxes and "Play from here" have a "2 players" toggle, so a creator can try a fight with a friend.
- **Schema v13:** the `coop` settings block and `input.bindings.keyboard2`. The migration fills in the defaults.

## 7. Milestones

Each is one PR, in order. Schema v13 comes in CO2.

| Id | PR | Contents | Done when |
| --- | --- | --- | --- |
| **CO1** | Players, not the player | • Store `players` list replacing the single-player fields; store actions take a slot<br>• Scene refs, runtimes and positions per player (`p1`, `p2`); `landHit`, CombatSystem, Projectiles, GrabSystem, Pickups, HeldWeapons, ModelBudgetDriver use them<br>• Enemy AI targets the nearest player; attack tokens per target; `hurtsPlayer` names a slot<br>• Camera framing and screen bounds over a list of players<br>• Still one player; no schema change | Every test passes and single-player plays exactly as before (headless checks of a level, the boss and weapons). Unit tests cover nearest-target, per-target tokens and framing with two positions. |
| **CO2** | Second player | • Schema v13: `coop` settings, `input.bindings.keyboard2`<br>• An `InputManager` per player, pad assignment, keyboard split, drop-in join and dropping out<br>• Player 2 colour, friendly fire, enemy health scaling, per-player lives and continues, game over when all are out<br>• HUD for two, join prompt, results for two, "1 PLAYER / 2 PLAYERS" on the start menu | Two players finish level 1 together in a headless check (two keyboard maps, and a stubbed second pad): both fight, the camera leashes, one loses all lives and rejoins with a continue. |
| **CO3** | Co-op controls and Forge | • CONTROLS panel Player 2 tab (keyboard 2 remap, pad assignment)<br>• Forge: Keyboard 2 bindings tab, "2 players" toggle for sandboxes and Play from here<br>• Boss bar placement, polish from playing CO2<br>• CLAUDE.md updated | A creator can try a boss fight with two players from the Forge, and a player can remap player 2's keys from the menu. |

CO1 is a refactor with no visible change, so it can be checked against today's behaviour. CO2 needs CO1. CO3 needs CO2.

**Testing:** nearest-target, per-target tokens, camera framing and leash, joining and dropping out, and lives and continues for two are pure functions with Vitest tests. Registry tests cover `keyboard2` (no input bound twice, no key shared with player 1's map while both are on the keyboard) and `coop`. Headless Playwright drives player 2 with the second keyboard map, and with a stubbed `navigator.getGamepads` for a second pad.

## 8. Decisions for Steve

Recommendations first. Decisions 1 to 3 shape CO1 and CO2; the others can change later.

1. **How player 2 joins.** Recommended: drop in at any time by pressing attack or start on a free device, as in the arcade. The alternative is choosing 1 or 2 players at the start menu only, which is simpler but means a friend who arrives mid-level has to wait for the next run.
2. **Two players on one keyboard.** Recommended: support it, with a second keyboard map (arrows and the number pad) that pushes the arrows out of player 1's map while it's in use. Many players have one pad or none. The alternative is to require a pad for player 2, which keeps the controls simpler.
3. **How many enemies attack at once.** Recommended: the attacker limit applies per player (two players face two attackers by default). The alternative is one shared limit, which makes co-op much easier than single player.
4. **Making co-op fair.** Recommended: multiply enemy health by 1.5 with two players and keep the same waves. Alternatives: add extra enemies to each wave (harder to tune and changes the level), or no scaling (co-op becomes easy).
5. **Player 2's fighter.** Recommended: the same fighter as player 1 in another colour, with an optional `p2Fighter` so a pack can make player 2 a different character. Choosing a character from a roster is a bigger feature and can come later.
