// The Forge's content tree: every definition a pack can hold, whether this
// pack defines it, overrides the default pack's, or inherits it, and the
// schema that edits it. Pure; the Forge screen renders it.

import type { z } from 'zod'
import { SETTINGS_SECTIONS } from '../content/registry'
import { packSchema, settingsSchema } from '../content/schemas'
import { deleteIn, getIn, setIn, type Path } from './paths'
import { defaultFor, fieldKind, labelFor } from './schemaForm'
import { baseContent, uniqueId, type PackJson } from './workspace'

export type NodeStatus = 'own' | 'override' | 'inherited'

export interface TreeNode {
  /** Unique within the tree, e.g. `moves/jab`. */
  key: string
  group: GroupId
  label: string
  /** Where it lives (or would live, once overridden) in the pack JSON. */
  path: Path
  schema: z.ZodTypeAny
  status: NodeStatus
  /** The default pack's version, if it has one. */
  base?: unknown
}

export type RecordGroup = 'moves' | 'ai' | 'enemyTypes' | 'pickups' | 'themes' | 'props' | 'projectiles' | 'weapons' | 'sounds' | 'music'
export type GroupId = 'pack' | 'settings' | RecordGroup | 'levels'

export const GROUPS: { id: GroupId; label: string; item: string }[] = [
  { id: 'pack', label: 'Pack', item: '' },
  { id: 'settings', label: 'Settings', item: '' },
  { id: 'moves', label: 'Moves', item: 'move' },
  { id: 'ai', label: 'AI archetypes', item: 'ai' },
  { id: 'enemyTypes', label: 'Enemy types', item: 'enemy' },
  { id: 'pickups', label: 'Pickups', item: 'pickup' },
  { id: 'themes', label: 'Themes', item: 'theme' },
  { id: 'props', label: 'Props', item: 'prop' },
  { id: 'projectiles', label: 'Projectiles', item: 'projectile' },
  { id: 'weapons', label: 'Weapons', item: 'weapon' },
  { id: 'sounds', label: 'Sounds', item: 'sound' },
  { id: 'music', label: 'Music', item: 'music' },
  { id: 'levels', label: 'Levels', item: 'level' },
]

const RECORD_GROUPS: RecordGroup[] = ['moves', 'ai', 'enemyTypes', 'pickups', 'themes', 'props', 'projectiles', 'weapons', 'sounds', 'music']

/** The pack's own name, version and description. */
export const packInfoSchema = packSchema.pick({ name: true, version: true, meta: true })

const recordValueSchema = (group: RecordGroup): z.ZodTypeAny => {
  const f = fieldKind(packSchema.shape[group])
  if (f.kind !== 'record') throw new Error(`${group} isn't a record`)
  return f.value
}

const levelSchemaOf = (): z.ZodTypeAny => {
  const f = fieldKind(packSchema.shape.levels)
  if (f.kind !== 'array') throw new Error('levels isn\'t an array')
  return f.item
}

const record = (json: PackJson, group: RecordGroup): Record<string, unknown> => {
  const r = json[group]
  return r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : {}
}

const packLevels = (json: PackJson): { id?: unknown }[] => (Array.isArray(json.levels) ? json.levels : [])

const statusOf = (own: boolean, inBase: boolean): NodeStatus => (own ? (inBase ? 'override' : 'own') : 'inherited')

/** Every node, in display order: the pack, settings sections, each record group, levels. */
export const buildTree = (json: PackJson): TreeNode[] => {
  const base = baseContent()
  const nodes: TreeNode[] = [{ key: 'pack', group: 'pack', label: 'Name and details', path: [], schema: packInfoSchema, status: 'own' }]

  const settings = (json.settings ?? {}) as Record<string, unknown>
  for (const section of SETTINGS_SECTIONS)
    nodes.push({
      key: `settings/${section}`,
      group: 'settings',
      label: labelFor(section),
      path: ['settings', section],
      schema: settingsSchema.shape[section],
      status: statusOf(settings[section] !== undefined, true),
      base: base.settings[section],
    })

  for (const group of RECORD_GROUPS) {
    const own = record(json, group)
    const inherited = base[group] as Record<string, unknown>
    const ids = [...Object.keys(inherited), ...Object.keys(own).filter((id) => !(id in inherited))]
    for (const id of ids)
      nodes.push({
        key: `${group}/${id}`,
        group,
        label: id,
        path: [group, id],
        schema: recordValueSchema(group),
        status: statusOf(id in own, id in inherited),
        base: inherited[id],
      })
  }

  const levels = packLevels(json)
  const baseLevels = base.levels
  for (const level of baseLevels) {
    const i = levels.findIndex((l) => l.id === level.id)
    nodes.push({
      key: `levels/${level.id}`,
      group: 'levels',
      label: level.name,
      // Overriding a default level appends it; the registry keeps its place in play order.
      path: ['levels', i >= 0 ? i : levels.length],
      schema: levelSchemaOf(),
      status: statusOf(i >= 0, true),
      base: level,
    })
  }
  levels.forEach((level, i) => {
    if (baseLevels.some((b) => b.id === level.id)) return
    const name = (level as { name?: unknown }).name
    nodes.push({
      key: `levels/${String(level.id ?? i)}#${i}`,
      group: 'levels',
      label: typeof name === 'string' && name ? name : `Level ${i + 1}`,
      path: ['levels', i],
      schema: levelSchemaOf(),
      status: 'own',
    })
  })
  return nodes
}

/** The value a node shows: the pack's own, else the default pack's. */
export const nodeValue = (json: PackJson, node: TreeNode): unknown =>
  node.status === 'inherited' ? node.base : node.path.length ? getIn(json, node.path) : json

/** Copy the default pack's version into the pack so it can be edited. */
export const overrideNode = (json: PackJson, node: TreeNode): PackJson =>
  node.status === 'inherited' ? (setIn(json, node.path, structuredClone(node.base)) as PackJson) : json

/** Take a definition out of the pack: an override goes back to the default; the pack's own is deleted. */
export const removeNode = (json: PackJson, node: TreeNode): PackJson =>
  node.status === 'inherited' || node.group === 'pack' ? json : (deleteIn(json, node.path) as PackJson)

/**
 * Add a new definition to a group, starting as a copy of `from` (an existing
 * one, so it's playable right away) or the schema's minimal shape. Returns
 * the new JSON and the new node's key.
 */
export const addNode = (json: PackJson, group: RecordGroup | 'levels', from?: unknown): { json: PackJson; key: string } => {
  const label = GROUPS.find((g) => g.id === group)!.item
  if (group === 'levels') {
    const levels = packLevels(json)
    const taken = [...baseContent().levels.map((l) => l.id), ...levels.map((l) => String(l.id))]
    const id = uniqueId(`new-${label}`, taken)
    const start = from !== undefined ? structuredClone(from) : defaultFor(levelSchemaOf())
    const level = { ...(start as object), id, name: 'New level' }
    return { json: { ...json, levels: [...levels, level] }, key: `levels/${id}#${levels.length}` }
  }
  const taken = [...Object.keys(baseContent()[group]), ...Object.keys(record(json, group))]
  const id = uniqueId(`new-${label}`, taken)
  const start = from !== undefined ? structuredClone(from) : defaultFor(recordValueSchema(group))
  return { json: setIn(json, [group, id], start) as PackJson, key: `${group}/${id}` }
}
