/**
 * Upper bound on a single frame's game-time step, in seconds.
 *
 * r3f reports the real time since the previous frame. When a tab is hidden,
 * requestAnimationFrame stops, and the first frame back reports the entire
 * hidden duration. Clamping keeps game-time timers (attack slots, cooldowns,
 * the spawn clock) from all expiring at once or paying out a burst.
 *
 * Keep this below the shortest gameplay timer (the player's 0.2s swing) so a
 * single long frame can never start and finish a swing before combat sees it.
 * These timers are independent of Rapier's fixed-step physics clock.
 */
export const MAX_FRAME_STEP = 0.1

export const gameStep = (delta: number): number => {
  if (Number.isNaN(delta)) return 0
  return Math.min(Math.max(delta, 0), MAX_FRAME_STEP)
}
