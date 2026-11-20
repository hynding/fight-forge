/**
 * Upper bound on a single frame's simulation step, in seconds.
 *
 * r3f reports the real time since the previous frame. When a tab is hidden,
 * requestAnimationFrame stops, and the first frame back reports the entire
 * hidden duration. Clamping keeps game-time timers (attack slots, cooldowns,
 * the spawn clock) from all expiring at once or paying out a burst.
 */
export const MAX_FRAME_STEP = 0.1

export const gameStep = (delta: number): number =>
  Math.min(Math.max(delta, 0), MAX_FRAME_STEP)
