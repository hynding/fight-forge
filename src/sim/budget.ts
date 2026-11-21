// Detail budget for imported (skinned) fighter models: with a crowd on
// screen, only the fighters nearest the player keep full detail (shadows,
// animation every frame); the rest drop their shadows and animate at half
// rate. Pure TS; ModelBudgetDriver ranks the models and GltfModel applies it.

/** Skinned fighters drawn at full detail; the player always counts as one. */
export const FULL_DETAIL_MODELS = 10

export type Detail = 'full' | 'reduced'

export interface BudgetEntry {
  /** Fighter name ("player" or an enemy id). */
  name: string
  /** Distance from the player (X/Z). */
  distance: number
}

/** Names of the fighters that get full detail: the player, then the nearest. */
export const fullDetail = (entries: BudgetEntry[], budget = FULL_DETAIL_MODELS): Set<string> =>
  new Set(
    [...entries]
      .sort((a, b) => (a.name === 'player' ? -1 : b.name === 'player' ? 1 : a.distance - b.distance))
      .slice(0, Math.max(0, budget))
      .map((e) => e.name)
  )

/** One per scene: registered models and their current detail. */
export interface ModelBudget {
  /** Model id to fighter name. */
  models: Map<number, string>
  detail: Map<number, Detail>
  nextId: number
}

export const createModelBudget = (): ModelBudget => ({ models: new Map(), detail: new Map(), nextId: 1 })

export const registerModel = (b: ModelBudget, name: string): number => {
  const id = b.nextId++
  b.models.set(id, name)
  b.detail.set(id, 'full')
  return id
}

export const unregisterModel = (b: ModelBudget, id: number): void => {
  b.models.delete(id)
  b.detail.delete(id)
}

/** Re-ranks every model given each fighter's distance from the player (missing: far away). */
export const assignDetail = (b: ModelBudget, distanceOf: (name: string) => number | null, budget = FULL_DETAIL_MODELS): void => {
  const entries = [...b.models].map(([id, name]) => ({ id, name, distance: distanceOf(name) ?? Infinity }))
  const full = fullDetail(entries, budget)
  // Several models can share a fighter name only briefly (a remount); rank by name.
  for (const e of entries) b.detail.set(e.id, full.has(e.name) ? 'full' : 'reduced')
}
