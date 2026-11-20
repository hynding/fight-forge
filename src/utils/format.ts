/** Seconds as m:ss (e.g. 83.4 -> "1:23"). */
export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
