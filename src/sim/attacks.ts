// Attack patterns: an enemy type's list of attacks, and the choice of one when
// the enemy may attack. `near` attacks fit inside the AI archetype's `reach`,
// `far` ones outside reach but within `farReach` (charges), `any` either way.
// Pure TS; Enemy keeps the cooldowns and a seeded random per enemy.

export type AttackRange = 'near' | 'far' | 'any'

export interface AttackDef {
  /** Move id. */
  move: string
  range: AttackRange
  /** Relative chance among the attacks that fit (default 1). */
  weight?: number
  /** Seconds before this attack can be picked again. */
  cooldown?: number
}

/** The attacks a type uses: its `attacks`, else one `any` attack with its `attackMove` (or the default). */
export const attacksOf = (def: { attacks?: AttackDef[]; attackMove?: string }, fallbackMove: string): AttackDef[] =>
  def.attacks && def.attacks.length > 0 ? def.attacks : [{ move: def.attackMove ?? fallbackMove, range: 'any' }]

/** Whether an attack can be used from where the enemy stands. */
export const fitsRange = (attack: AttackDef, at: 'near' | 'far'): boolean => attack.range === 'any' || attack.range === at

/** Seconds left on each attack's cooldown, by index. */
export type AttackCooldowns = number[]

export const stepCooldowns = (c: AttackCooldowns, dt: number): void => {
  for (let i = 0; i < c.length; i++) {
    const left = (c[i] ?? 0) - dt
    // Float slack, so a 4 s cooldown is over after 4 s of steps.
    c[i] = left <= 1e-9 ? 0 : left
  }
}

/** The attacks usable now at `at`, off cooldown, with a positive weight. */
const usable = (attacks: AttackDef[], at: 'near' | 'far', cooldowns: AttackCooldowns): number[] =>
  attacks.flatMap((a, i) => (fitsRange(a, at) && (cooldowns[i] ?? 0) <= 0 && (a.weight ?? 1) > 0 ? [i] : []))

/** True when some `far` attack is ready: the AI may attack from far reach. */
export const farAttackReady = (attacks: AttackDef[], cooldowns: AttackCooldowns): boolean =>
  attacks.some((a, i) => a.range === 'far' && (cooldowns[i] ?? 0) <= 0 && (a.weight ?? 1) > 0)

/**
 * Picks an attack by weight among those that fit `at` and are off cooldown.
 * Returns its index, or null when none fits. `startCooldown` once it's used.
 */
export const pickAttack = (attacks: AttackDef[], at: 'near' | 'far', cooldowns: AttackCooldowns, random: () => number): number | null => {
  const options = usable(attacks, at, cooldowns)
  if (options.length === 0) return null
  const total = options.reduce((sum, i) => sum + (attacks[i].weight ?? 1), 0)
  let roll = random() * total
  let chosen = options[options.length - 1]
  for (const i of options) {
    roll -= attacks[i].weight ?? 1
    if (roll < 0) {
      chosen = i
      break
    }
  }
  return chosen
}

/** The attack at `index` was used: it waits out its cooldown. */
export const startCooldown = (cooldowns: AttackCooldowns, attacks: AttackDef[], index: number): void => {
  cooldowns[index] = attacks[index].cooldown ?? 0
}

/** Each attack's chance (0..1) of being picked at `at` with nothing on cooldown, for the Forge. */
export const attackChances = (attacks: AttackDef[], at: 'near' | 'far'): number[] => {
  const options = usable(attacks, at, [])
  const total = options.reduce((sum, i) => sum + (attacks[i].weight ?? 1), 0)
  return attacks.map((a, i) => (total > 0 && options.includes(i) ? (a.weight ?? 1) / total : 0))
}

/** A small deterministic random source (mulberry32), seeded from a string such as an enemy id. */
export const seededRandom = (seed: string): (() => number) => {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
