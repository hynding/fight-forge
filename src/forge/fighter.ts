// Pure helpers for the Forge's fighter, model and move tools: importing a
// model into a pack, fitting it to the fighter's body, move timelines, and
// editing the light-attack combo chain.

import { BUNDLE_LIMITS, glbProblem } from '../content/bundle'
import { getIn, setIn } from './paths'
import type { ActionSettings } from '../sim/input'
import type { Moveset } from '../sim/moveset'
import { baseContent, uniqueId, type PackJson, type WorkspacePack } from './workspace'

type Json = Record<string, unknown>


/** "Hero Model (v2).glb" → "hero-model-v2" (a valid id). */
export const fileStem = (name: string, prefix = 'model') => {
  const s = name
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z]/.test(s) ? s : `${prefix}-${s}`.replace(/-$/, '')
}

export const assetsOf = (json: PackJson): Json[] => (Array.isArray(json.assets) ? (json.assets as Json[]) : [])

/**
 * Add a .glb model file to the pack as an asset. Returns the new pack and the
 * asset's id, or why the file can't be used.
 */
export const addModelAsset = (
  wp: WorkspacePack,
  filename: string,
  bytes: Uint8Array
): { ok: true; pack: WorkspacePack; assetId: string } | { ok: false; message: string } => {
  const problem = glbProblem(bytes)
  if (problem) return { ok: false, message: `"${filename}" ${problem}` }
  if (bytes.length > BUNDLE_LIMITS.model)
    return { ok: false, message: `"${filename}" is ${bytes.length} bytes; models can be up to ${BUNDLE_LIMITS.model}` }
  const assets = assetsOf(wp.json)
  const id = uniqueId(fileStem(filename), assets.map((a) => String(a.id)))
  const path = `models/${id}.glb`
  // A fresh entry: bytes and hash are filled in when the pack is exported.
  const json = { ...wp.json, assets: [...assets, { id, kind: 'model', path }] }
  return { ok: true, pack: { ...wp, json, files: { ...wp.files, [path]: bytes }, updatedAt: Date.now() }, assetId: id }
}

/** Remove an asset and its file. References to it are left for validation to report. */
export const removeAsset = (wp: WorkspacePack, id: string): WorkspacePack => {
  const assets = assetsOf(wp.json)
  const asset = assets.find((a) => a.id === id)
  if (!asset) return wp
  const files = { ...wp.files }
  delete files[String(asset.path)]
  return { ...wp, json: { ...wp.json, assets: assets.filter((a) => a !== asset) }, files, updatedAt: Date.now() }
}

/** The file of a pack's asset, by asset id. */
export const assetFile = (wp: WorkspacePack, id: string): Uint8Array | undefined => {
  const asset = assetsOf(wp.json).find((a) => a.id === id)
  return asset ? wp.files[String(asset.path)] : undefined
}

/** A new glTF model reference for an imported asset (clips mapped later). */
export const gltfModelFor = (assetId: string) => ({
  kind: 'gltf',
  asset: assetId,
  scale: 1,
  offset: [0, -1, 0],
  // glTF models face +Z; fighters want -Z.
  rotationY: Number(Math.PI.toFixed(4)),
  tintMaterials: [],
  clips: {},
})

/**
 * Scale and offset that stand a model of the given bounds (in its own units)
 * on the floor, as tall as the fighter's body (`halfY` above and below the
 * body's centre).
 */
export const fitModel = (minY: number, maxY: number, halfY: number): { scale: number; offset: [number, number, number] } => {
  const height = maxY - minY
  if (!(height > 0)) return { scale: 1, offset: [0, -halfY, 0] }
  const scale = Number(((2 * halfY) / height).toPrecision(4))
  return { scale, offset: [0, Number((-halfY - minY * scale).toFixed(4)), 0] }
}

/** The body's half extents for a fighter: its own, else the pack's (or the default) body settings. */
export const fighterHalfExtents = (json: PackJson, fighter: Json): [number, number, number] =>
  (fighter.colliderHalfExtents as [number, number, number] | undefined) ??
  (getIn(json, ['settings', 'body', 'colliderHalfExtents']) as [number, number, number] | undefined) ??
  baseContent().settings.body.colliderHalfExtents

// --------------------------------------------------------------- moves

export interface MoveTiming {
  startup: number
  active: number
  recovery: number
  cancelFrom?: number
}

export const FRAME = 1 / 60

export type Phase = 'startup' | 'active' | 'recovery'

export const moveLength = (m: MoveTiming): number => m.startup + m.active + m.recovery

/** The phase at time `t` into the move (the end counts as recovery). */
export const phaseAt = (m: MoveTiming, t: number): Phase =>
  t < m.startup ? 'startup' : t < m.startup + m.active ? 'active' : 'recovery'

/** How many 60 Hz frames the move lasts (at least 1). */
export const moveFrames = (m: MoveTiming): number => Math.max(1, Math.round(moveLength(m) / FRAME))

// --------------------------------------------------------------- combo chain

/** Every move in the pack's view: the default pack's, then the pack's own over them. */
export const effectiveMoves = (json: PackJson): Record<string, Json> => ({
  ...(baseContent().moves as unknown as Record<string, Json>),
  ...((json.moves ?? {}) as Record<string, Json>),
})

/**
 * The moveset row that starts the light combo: the last plain attack (on the
 * ground, any direction, no cost), the one a press falls through to.
 */
export const comboRoot = (moveset: readonly Json[]): number => {
  for (let i = moveset.length - 1; i >= 0; i--) {
    const t = moveset[i]
    if (t.action === 'attack' && (t.when ?? 'ground') === 'ground' && t.direction === undefined && t.cost === undefined) return i
  }
  return -1
}

const playerOf = (json: PackJson): Json => (getIn(json, ['settings', 'player']) ?? baseContent().settings.player) as Json

/** The player's light-attack chain: the combo root's move, then each move's `next`, stopping at a loop or a missing move. */
export const comboChain = (json: PackJson): string[] => {
  const moves = effectiveMoves(json)
  const moveset = (playerOf(json).moveset ?? []) as Json[]
  const root = comboRoot(moveset)
  const chain: string[] = []
  let id = root >= 0 ? (moveset[root].move as string | undefined) : undefined
  while (id && moves[id] && !chain.includes(id)) {
    chain.push(id)
    id = moves[id].next as string | undefined
  }
  return chain
}

/**
 * Make `chain` the light-attack combo: the combo root's move (a plain attack
 * row, added at the end if there is none) is its first move and each move's
 * `next` the one after (the last has none). Default moves and the player
 * settings it touches are copied into the pack.
 */
export const setComboChain = (json: PackJson, chain: string[]): PackJson => {
  if (chain.length === 0) return json
  const moves = effectiveMoves(json)
  let out = json
  const player = playerOf(json)
  const moveset = structuredClone((player.moveset ?? []) as Json[])
  const root = comboRoot(moveset)
  if (getIn(json, ['settings', 'player']) === undefined || root < 0 || moveset[root].move !== chain[0]) {
    if (root < 0) moveset.push({ action: 'attack', move: chain[0] })
    else moveset[root] = { ...moveset[root], move: chain[0] }
    out = setIn(out, ['settings', 'player'], { ...structuredClone(player), moveset }) as PackJson
  }
  chain.forEach((id, i) => {
    const move = moves[id]
    if (!move) return
    const next = chain[i + 1]
    if (move.next === next) return
    const updated: Json = { ...structuredClone(move) }
    if (next) updated.next = next
    else delete updated.next
    out = setIn(out, ['moves', id], updated) as PackJson
  })
  return out
}

/** The pack's action settings (which optional actions are on), else the default pack's. */
export const effectiveActions = (json: PackJson): ActionSettings =>
  (getIn(json, ['settings', 'input', 'actions']) as ActionSettings | undefined) ?? baseContent().settings.input.actions

/**
 * Optional actions turned on but doing nothing: heavy or special with no
 * moveset row or move branch using them, or grabs with no `grabbing` row
 * (grabs only happen when the moveset says what to do while holding).
 */
export const unusedActions = (moveset: Moveset, moves: Record<string, Json>, actions: ActionSettings): ('heavy' | 'special' | 'grab')[] => [
  ...(['heavy', 'special'] as const).filter(
    (a) =>
      actions[a].enabled &&
      !moveset.some((t) => (Array.isArray(t.action) ? t.action : [t.action]).includes(a)) &&
      !Object.values(moves).some((m) => Object.keys(((m as { branches?: object }).branches ?? {}) as object).some((k) => k.split('+').includes(a)))
  ),
  ...(actions.grab?.enabled && !moveset.some((t) => t.when === 'grabbing') ? (['grab'] as const) : []),
]
