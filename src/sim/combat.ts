// Pure hit-detection math for the combat system.

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface PlayerHitConfig {
  range: number
  /** Minimum dot(facing, direction to target). */
  cone: number
}

const distance = (a: Vec3Like, b: Vec3Like) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * Whether a player swing facing `facing` (unit vector) hits a target at
 * `target`: within range and inside the facing cone.
 */
export const isInAttackCone = (
  attacker: Vec3Like,
  facing: Vec3Like,
  target: Vec3Like,
  cfg: PlayerHitConfig
): boolean => {
  const d = distance(attacker, target)
  if (d >= cfg.range) return false
  if (d === 0) return false
  const dot =
    (facing.x * (target.x - attacker.x) +
      facing.y * (target.y - attacker.y) +
      facing.z * (target.z - attacker.z)) /
    d
  return dot > cfg.cone
}

export interface EnemyHitConfig {
  hitRange: number
  damageCooldown: number
}

/**
 * Whether the enemy holding the attack slot lands a hit now: within range,
 * and its per-enemy cooldown (game time since its last hit) has passed.
 */
export const enemyCanHitPlayer = (
  enemy: Vec3Like,
  player: Vec3Like,
  now: number,
  lastHitTime: number | undefined,
  cfg: EnemyHitConfig
): boolean =>
  distance(enemy, player) < cfg.hitRange && now - (lastHitTime ?? -Infinity) > cfg.damageCooldown
