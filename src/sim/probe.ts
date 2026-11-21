// A read-only window into the mounted scene for tools outside it (the Forge
// over a paused playtest): where the player stands now. GameScene installs
// the getter on mount and removes it on unmount.

export const sceneProbe: { playerX: () => number | null } = { playerX: () => null }
