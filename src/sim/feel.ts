// Game feel: hit-stop, screen shake, hit sparks, dust and damage numbers.
// Each is tuned (and can be turned off) in the content's `settings.feel`.
// This is the pure part: one `FeelState` per scene that combat feeds with
// hits, the sim loop reads for hit-stop, the camera for shake, and the
// effects layer draws from.

export interface FeelSettings {
  /** A brief freeze of the whole fight when a hit lands: base + perDamage × damage seconds, at most max. */
  hitStop: { enabled: boolean; base: number; perDamage: number; max: number }
  /** Camera shake in world units, the same way; it dies away at `decay` per second. */
  shake: { enabled: boolean; base: number; perDamage: number; max: number; decay: number }
  /** Sparks where a hit lands (another colour when it's guarded). */
  sparks: { enabled: boolean; count: number; color: string; blockColor: string; life: number }
  /** A puff of dust where a fighter is knocked down or out. */
  dust: { enabled: boolean; color: string; life: number }
  /** Damage dealt, floating up from the target. */
  damageNumbers: { enabled: boolean; color: string; playerColor: string; life: number }
  /**
   * Controller rumble (0 to 1) for hits the player takes: base + perDamage ×
   * damage, at most max, for `duration` seconds. Hits the player lands rumble
   * `dealt` times as hard, and a KO at least `ko`.
   */
  rumble: { enabled: boolean; base: number; perDamage: number; max: number; duration: number; dealt: number; ko: number }
}

export type Effect =
  | { id: number; kind: 'sparks'; x: number; y: number; z: number; age: number; life: number; color: string; count: number; seed: number }
  | { id: number; kind: 'dust'; x: number; y: number; z: number; age: number; life: number; color: string }
  | { id: number; kind: 'number'; x: number; y: number; z: number; age: number; life: number; color: string; text: string }

export interface FeelState {
  /** Seconds of hit-stop left. */
  hold: number
  /** Current shake amplitude. */
  shake: number
  effects: Effect[]
  nextId: number
  /** Bumped when effects are added, so the drawing side knows to re-render. */
  version: number
}

export const createFeel = (): FeelState => ({ hold: 0, shake: 0, effects: [], nextId: 1, version: 0 })

const scaled = (on: boolean, base: number, perDamage: number, max: number, damage: number) =>
  on ? Math.min(max, base + perDamage * damage) : 0

export const hitStopFor = (damage: number, s: FeelSettings): number => scaled(s.hitStop.enabled, s.hitStop.base, s.hitStop.perDamage, s.hitStop.max, damage)
export const shakeFor = (damage: number, s: FeelSettings): number => scaled(s.shake.enabled, s.shake.base, s.shake.perDamage, s.shake.max, damage)

/** Rumble strength (0 to 1) for a hit involving the player; 0 when off or the player isn't in it. */
export const rumbleFor = (s: FeelSettings, hit: { damage: number; toPlayer: boolean; byPlayer: boolean; ko: boolean }): number => {
  const r = s.rumble
  if (!r.enabled || !(hit.toPlayer || hit.byPlayer)) return 0
  const base = scaled(true, r.base, r.perDamage, r.max, hit.damage) * (hit.toPlayer ? 1 : r.dealt)
  return Math.min(1, hit.ko ? Math.max(base, r.ko) : base)
}

export interface HitInfo {
  /** Where it landed. */
  at: { x: number; y: number; z: number }
  /** The target's feet, for dust. */
  feet: { x: number; y: number; z: number }
  damage: number
  guarded: boolean
  /** The player was hit (its damage number gets the player colour). */
  toPlayer: boolean
  /** Knocked down or out: kick up dust. */
  down: boolean
}

/** A hit landed: hold the fight, shake the camera, and add its effects. Longer and stronger hits win over weaker ones still running. */
export const feelHit = (f: FeelState, s: FeelSettings, hit: HitInfo): void => {
  f.hold = Math.max(f.hold, hitStopFor(hit.damage, s))
  f.shake = Math.max(f.shake, shakeFor(hit.damage, s))
  const add = (e: Omit<Effect, 'id' | 'age'> & Record<string, unknown>) => {
    f.effects.push({ ...e, id: f.nextId, age: 0 } as Effect)
    f.nextId++
  }
  if (s.sparks.enabled && s.sparks.count > 0)
    add({ kind: 'sparks', ...hit.at, life: s.sparks.life, color: hit.guarded ? s.sparks.blockColor : s.sparks.color, count: s.sparks.count, seed: f.nextId })
  if (s.dust.enabled && hit.down) add({ kind: 'dust', ...hit.feet, life: s.dust.life, color: s.dust.color })
  if (s.damageNumbers.enabled && hit.damage > 0)
    add({
      kind: 'number',
      ...hit.at,
      life: s.damageNumbers.life,
      color: hit.toPlayer ? s.damageNumbers.playerColor : s.damageNumbers.color,
      text: String(Math.round(hit.damage)),
    })
  f.version++
}

/** Advance effects and shake by `dt` seconds; finished effects go. */
export const stepFeel = (f: FeelState, s: FeelSettings, dt: number): void => {
  f.shake = f.shake * Math.exp(-s.shake.decay * dt)
  if (f.shake < 0.001) f.shake = 0
  const before = f.effects.length
  for (const e of f.effects) e.age += dt
  f.effects = f.effects.filter((e) => e.age < e.life)
  if (f.effects.length !== before) f.version++
}

/** The camera's offset for a shake amplitude at a moment: quick, uneven wobble on both axes. */
export const shakeOffset = (amp: number, t: number): { x: number; y: number } => ({
  x: amp * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113) * 0.4),
  y: amp * (Math.sin(t * 89 + 1.3) * 0.6 + Math.sin(t * 131 + 0.4) * 0.4),
})

/** Spark directions: `count` evenly spread, jittered by the effect's seed so each burst looks different. */
export const sparkDirections = (count: number, seed: number): { x: number; y: number }[] =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + ((seed * 2.399) % (Math.PI * 2))
    const speed = 0.7 + 0.3 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233))
    return { x: Math.cos(a) * speed, y: Math.sin(a) * speed }
  })
