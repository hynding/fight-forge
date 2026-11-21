# Plan: extended, customizable controls

Status: **proposed** (2026-11-21). Expands roadmap milestone M5.3 ("Gamepad support") into a small series of PRs. Nothing here is built yet. The choices that only Steve can make are in [section 9](#9-decisions-for-steve).

## 1. Goal

Players can play Fight Forge the way they like: keyboard, keyboard + mouse, or a game controller, and remap any of them. Creators can decide, in the Forge and without code, which actions their pack uses (for example heavy attacks, grabs or specials), what those actions do, and what the default buttons are on each device.

## 2. Where we are today

Built in M1.6, M2.4 and M3.5 (as of the M5.2 branch):

- **Actions** are a fixed list in `src/sim/input.ts` (`INPUT_ACTIONS`): left, right, forward, backward, jump, attack, block, dodge, pause, hitboxes.
- **Bindings** are keyboard only: the pack's `input.bindings` maps each action to lowercase `KeyboardEvent.key` values. The player's remapping is one override in localStorage (`fight-forge.input-override.v1`), merged by `getBindings()`; the start menu's CONTROLS panel rebinds one key per action, and the Forge's `BindingsTools` edits the pack's default keys.
- **Reading input**: `useControls` keeps held keys in React state; `Player` turns them into an `Intent` with `inputIntent` (digital: each axis is -1, 0 or 1). Run is detected from a double tap (`stepRunDetector`). Pause and the hitbox overlay listen for keys on their own.
- **Moves**: the player has exactly three entry points, `player.lightAttack`, `player.jumpAttack` and `player.dashAttack`, picked in `Player.tsx` by situation. There is no heavy attack, grab, throw or special.

Limits this plan removes:

1. Only one device kind, and its key names are baked into the schema.
2. Key state lives in React and is sampled whenever the sim step happens to run, so a tap shorter than a sim step can be missed (headless tests already need ~150 ms holds).
3. Movement is digital, so an analog stick couldn't walk slowly or run by pushing further.
4. New actions need code in three places (the list, `Controls`, `inputIntent`) and a hard-coded move pick in `Player.tsx`.
5. Menus can only be driven with a mouse and the Escape key.

## 3. Design overview

```
 keyboard events ─┐
 mouse buttons ───┼─> InputSources ─> ActionSampler (per sim step) ─> ActionFrame ─> inputIntent ─> Intent ─> moveset ─> move
 navigator.getGamepads() ┘        ^ bindings (pack defaults + player overrides, per device)
```

Three layers, each pure where possible:

1. **Sources** turn raw device state into *inputs* with stable names: `key:j`, `mouse:left`, `pad:a`, `pad:ls-left`. Keyboard and mouse sources latch events between steps; the gamepad source polls `navigator.getGamepads()` once per sim step.
2. **The action sampler** (`src/sim/actions.ts`, pure) maps inputs to actions through the bindings and produces an `ActionFrame` per sim step: for each action `held`, `pressed` (went down since the last step, even if already released) and `released`, plus an analog `move` vector. Edge latching fixes limit 2. It also remembers the **last used device**, so on-screen prompts show the right buttons.
3. **The moveset** (`src/sim/moveset.ts`, pure) picks a move from the frame, the fighter's situation and the pack's data, replacing the three hard-coded entry points (section 5).

`useControls` is replaced by a non-React `InputManager` owned by `GameScene` (like `runtimes`), registered as an `input` sim system that runs first in `SYSTEM_ORDER`. `Player` reads the frame from it instead of React state. Pause, hitbox toggle and menu navigation read the same actions, so a gamepad's Start pauses exactly like Escape.

## 4. Actions

### 4.1 The action vocabulary

The engine keeps a **fixed list of actions** (code has to know what an action means), grouped so the UI can show them sensibly. New entries are in bold.

| Group | Actions | Notes |
| --- | --- | --- |
| Movement | left, right, forward, backward | Also driven by an analog stick as one vector. |
| Movement | **run** | Hold to run. An alternative to double-tap (pack option, section 4.2). |
| Fighting | jump, attack, block, dodge | As today. |
| Fighting | **heavy** | A second attack button: slower, stronger moves; can end or branch a combo. |
| Fighting | **grab** | Grab a nearby enemy (if the pack uses button grabs); then attack/direction throw. |
| Fighting | **special** | The pack decides what it does and what it costs (health, meter or cooldown). |
| System | pause, hitboxes | As today. |
| Menus | **confirm**, **back**, **menuUp/Down/Left/Right** | Only for menus; default to the gamepad's A/B and d-pad, Enter/Escape and arrows. Not shown in the gameplay remap list. |

Packs **can't invent brand-new actions**, but every fighting action is a slot the pack fills with its own moves, so "special" can be a fireball in one pack and a spin kick in another. This keeps validation, remapping and on-screen help simple. (Decision 2 asks whether that's enough.)

### 4.2 What a pack controls

A new `input.actions` block in `settings.json` (schema v4) says which optional actions are on and how a few actions behave. Turned-off actions disappear from the remap screens, the help line and the Forge's binding editor.

```jsonc
"input": {
  "actions": {
    "heavy":   { "enabled": true },
    "grab":    { "enabled": true, "trigger": "contact" },   // contact = walk into a dazed or idle enemy (classic); button = press grab
    "special": { "enabled": true },
    "run":     { "mode": "doubleTap" },                      // doubleTap | hold | both; a stick pushed past input.analog.runThreshold always runs
    "block":   { "mode": "hold" }                            // hold | toggle (accessibility)
  },
  "analog": { "deadZone": 0.2, "runThreshold": 0.85 },
  "bindings": { "keyboard": { ... }, "gamepad": { ... }, "mouse": { ... } }
}
```

The default pack turns on heavy and special and leaves grab off until the grab mechanic exists (milestone C6). The player can still choose toggle block or hold-to-run for themselves (section 6.3), since those are comfort settings, not game rules.

## 5. Movesets: what each action does

Today `player.lightAttack / jumpAttack / dashAttack` are three fixed slots. They become a data table on each fighter definition, `moveset`, an ordered list of **triggers**. The first trigger whose conditions match starts its move:

```jsonc
"moveset": [
  { "action": "attack",  "when": "air",                          "move": "jumpKick" },
  { "action": "attack",  "when": "running",                      "move": "dashPunch" },
  { "action": "attack",  "direction": "away",                    "move": "backElbow" },
  { "action": "heavy",   "direction": "up",                      "move": "launcher" },
  { "action": "heavy",                                           "move": "haymaker" },
  { "action": ["attack", "jump"],                                "move": "spinKick", "cost": { "health": 8 } },
  { "action": "special",                                         "move": "fireball", "cost": { "meter": 50 } },
  { "action": "attack",                                          "move": "jab" }
]
```

- `action`: one action, or a list pressed together within a short window (`input.chordWindow`, default 0.06 s), for the classic attack + jump desperation move.
- `when`: `ground` (default), `air`, `running`, `blocking`, `grabbing`, `nearDowned` (a stomp on a knocked-down enemy).
- `direction`: held direction relative to facing: `toward`, `away`, `up` (depth back), `down` (depth front), or none.
- `cost`: optional `health` (never takes the last point), `meter`, or `cooldown` seconds. Meter rules (gain on hit / on taking damage, max) live in `rules`.
- Combos are unchanged: a move's `next` still chains on the button that started it. A move may add `branches: { "heavy": "uppercut" }` so pressing a different action in the cancel window goes elsewhere.

**Motion inputs** (quarter circles and the like) are left out on purpose: they're hard on a keyboard and unusual in beat 'em ups. Direction + button covers back attacks, launchers and specials. (Decision 3.)

**Migration 3 → 4** rewrites the three old slots into a three-trigger moveset, so every existing pack plays identically. Enemies can use the same table later for AI variety, but the AI keeps choosing its attack itself for now.

**In the Forge**, the fighter tools get a MOVESET card: one row per trigger, with dropdowns for action, situation and direction, a move picker, an optional cost and drag to reorder. A note warns when a trigger can never fire because an earlier row always matches first. The combo editor from M3.2 stays as the way to edit the light-attack chain.

## 6. Devices

### 6.1 Bindings data (schema v4)

`input.bindings` becomes one map per device. Each maps an action to a list of input names for that device:

| Device | Input names |
| --- | --- |
| `keyboard` | Lowercase `KeyboardEvent.key` values, as today (`"j"`, `" "`, `"arrowleft"`). |
| `mouse` | `left`, `right`, `middle`, `back`, `forward`, `wheelUp`, `wheelDown`. |
| `gamepad` | W3C **standard mapping** names: `a b x y lb rb lt rt select start ls rs up down left right home`, and stick directions `ls-left ls-right ls-up ls-down rs-left rs-right rs-up rs-down`. |

Default gamepad layout (Xbox names; PlayStation shows ✕ ○ □ △ for the same buttons):

| Action | Buttons |
| --- | --- |
| Move / depth | Left stick, d-pad |
| Jump | A |
| Attack | X |
| Heavy | Y |
| Special | B |
| Block | LB, LT |
| Dodge | RB, RT |
| Run | Click left stick (only when run mode includes hold) |
| Grab | none (contact grabs) |
| Pause | Start |
| Hitboxes | none (debug; keyboard H) |

Default mouse layout: left button = attack, right button = block, the rest unbound. Mouse buttons only count while the pointer is over the game view, and the right-click menu is suppressed there only.

Keyboard defaults stay as today, plus L = heavy, I = special, Left Ctrl = run (hold mode), O = grab (button mode).

Validation (registry): an input may be bound to only one action per device; the keyboard must cover left, right, attack and pause; the gamepad must cover pause and either a stick or d-pad for movement; every enabled action must be reachable on the keyboard. Disabled actions may keep bindings (so turning one back on restores them).

### 6.2 Gamepad support

- **Detection**: listen for `gamepadconnected` / `gamepaddisconnected` and poll `navigator.getGamepads()` once per sim step (once per frame on menus). Browsers only reveal a pad after a button press, so the menu shows "Press any button on your controller" until one is seen.
- **Which pad**: the first pad to press a button drives player 1. Local co-op (Phase 6) will assign pads to players in a join screen; the `InputManager` is built per player so it's ready for that.
- **Analog movement**: left stick with a radial dead zone (`input.analog.deadZone`, player adjustable) gives a move vector with magnitude. `stepVelocity` scales walk speed by magnitude; past `runThreshold` the fighter runs. The d-pad stays digital.
- **Non-standard pads**: if `gamepad.mapping !== "standard"`, the pad still works with raw names (`b0`…`b16`, `axis0+`…) and the remap screen shows "Button 7"; the defaults are applied by index as a best guess and the menu suggests remapping.
- **Button labels**: the pad's `id` picks a label set (Xbox, PlayStation, Nintendo, generic). Labels are text (✕, ○, LB, ZL), not image assets, so no art licensing is needed.
- **Rumble**: where `vibrationActuator` exists, short pulses on taking a hit, landing a heavy hit and KO, scaled by a new `feel.rumble` setting and a player on/off toggle.
- **Menus**: start menu, level select, pause, results and game over become navigable with the d-pad/stick and confirm/back (a small focus-ring helper over the existing buttons). The Forge stays mouse + keyboard; it is a creation tool, not a couch screen.
- **Pause on disconnect**: if the active pad disconnects mid-fight, the game pauses.

### 6.3 Keyboard + mouse options

- Any action can be bound to mouse buttons or the wheel alongside keys.
- **Face the cursor** (player option, off by default): the player turns toward the mouse's side of the screen when not moving, so you can walk away while attacking behind you. Facing stays left/right only.
- Comfort options per player, saved with their bindings: toggle block, hold-to-run vs double-tap (if the pack allows both), and the double-tap window.
- No pointer lock or mouse aiming: the game has no aiming to do.

### 6.4 Player remapping, per device

- The localStorage override becomes `fight-forge.input-override.v2`: `{ keyboard, mouse, gamepad, options }`, each a partial action → inputs map like today. A v1 override is read once and moved into `keyboard`.
- Overrides are kept **per device kind, not per controller model** (simple and enough for most players). Decision 5 asks whether per-controller profiles are worth it.
- **Player overrides always win** over the pack's defaults, and survive switching packs; a pack that turns an action off just hides it.
- The CONTROLS panel gets tabs: **Keyboard & mouse** and **Controller**. Each row shows the action and its inputs; click (or press A on the row) then press the new key/button. Escape or the pad's Select cancels capture. A **Reset this device** button, a dead-zone slider with a live stick dot, vibration and face-cursor toggles. Conflicts are resolved the way `rebind` does today: the input moves to the new action and the old row shows what it lost.
- **On-screen prompts** (`controlsHelp`, HUD hints, the pause menu) use the last used device's labels, so a controller player sees "X — Attack" and a keyboard player sees "J — Attack".

## 7. Forge changes

- **BindingsTools** gets the same Keyboard / Mouse / Controller tabs, with capture for each (gamepad capture polls while listening).
- A new **ACTIONS** card in the input section: switches for heavy, grab and special, run mode, block mode, analog dead zone and run threshold. It's generated from the schema like the rest of the inspector; only the switches' explanations are hand-written.
- **MOVESET** card on fighter tools (section 5).
- The coverage checks from M3.5 extend to the new fields, and the pack validator flags an enabled action with no trigger in the player's moveset ("Special is on but nothing uses it").

## 8. Milestones

Each is one PR, in order. They replace roadmap M5.3; M5.4 (performance) is unchanged.

| Id | PR | Contents | Done when |
| --- | --- | --- | --- |
| **C1** | Input layer | `InputManager`, keyboard source, pure `ActionSampler` with edge latching, `input` sim system, last-used device; `useControls` removed; pause and hitboxes read actions. No behaviour change. | Existing tests pass; a one-frame tap is never dropped (unit test); headless key taps no longer need long holds. |
| **C2** | Per-device bindings | Schema v4 + migration 3 → 4 (bindings into `keyboard`), mouse source, override v2 + v1 import, CONTROLS tabs, Forge binding tabs, registry rules. | An old pack and an old override load unchanged; mouse buttons can be bound and work only over the game view. |
| **C3** | Gamepad | Gamepad source (standard + raw), analog movement and run threshold, label sets, rumble, menu navigation, pause on disconnect, prompts by last device. | A full level can be played and all menus used with only a controller; pure tests feed fake `Gamepad` objects; Playwright stubs `navigator.getGamepads` for one smoke test. |
| **C4** | Movesets | `moveset` triggers (action, chord, situation, direction, cost), migration of the three slots, Forge MOVESET card, `branches`. | Default pack plays identically; a pack can add a back attack and a chord move without code. |
| **C5** | Heavy and special | heavy and special actions enabled in the default pack with moves, meter rules and HUD meter, run hold mode, toggle block, face cursor. | The default pack ships a heavy combo ender and a special; both remap on every device. |
| **C6** | Grabs and throws | Grab state for fighters (contact or button), held-enemy attacks, forward/back throws that knock down and can hit other enemies; enemies can be grab-immune by type. Pulled forward from Phase 6. | Grabbing and throwing works in the default pack and in the sandbox. |

C1 and C2 are pure plumbing and safe to start immediately. C3 depends on C2. C4 can start after C1, in parallel with C3. C5 needs C4; C6 needs C4 and benefits from C5's meter work.

Testing follows the usual rules: the sampler, mapping, dead zone, chord window, moveset matching, migrations and override import are pure modules with Vitest tests; the default-pack snapshot is updated deliberately in C2 and C4.

## 9. Decisions for Steve

Recommendations first; each can be changed later, but 1 and 2 shape the milestones.

1. **Which new actions to build now.** *Decided by Steve on 2026-11-21:* heavy, special and grab/throw (C5, C6), plus hold-to-run. All six milestones go ahead.
2. **Fixed action list vs creator-defined actions.** Recommended: fixed list, packs fill the slots with their own moves. Creator-defined actions (a pack adds "taunt" with its own button) are possible later but complicate validation, remapping and help text.
3. **Motion inputs** (quarter circle + attack). Recommended: no; direction + button and chords only.
4. **Special cost.** Recommended: let each trigger choose (health, meter or cooldown), with the default pack using the classic health cost for its attack + jump move and a meter for the special button.
5. **Per-controller profiles** (separate layouts for an Xbox pad and a PlayStation pad). Recommended: no, one controller layout per player; revisit with local co-op.
6. **Touch controls** (on-screen buttons for phones and tablets). Not asked for; recommended as a separate later milestone, since the gallery's share links will bring mobile visitors.
