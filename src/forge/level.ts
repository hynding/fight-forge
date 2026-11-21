// The Forge level editor's pure parts: a level seen as objects at absolute
// positions along the stage (fights, the goal, pickups, props, placed
// enemies), moved, added and removed by absolute X, and the segments that
// hold them resized, split, added and removed. Positions are stored per
// segment in the content, so moving an object past a segment boundary moves
// it into the next segment.

import type { Level, LevelItem, Segment, SpawnDef, Trigger, Wave } from '../sim/level'
import type { PropPlacement } from '../sim/props'

type ListKey = 'triggers' | 'items' | 'props'

/** What the editor can select. */
export type LevelRef =
  | { kind: 'trigger' | 'item' | 'prop'; seg: number; index: number }
  | { kind: 'enemy'; seg: number; index: number; wave: number; enemy: number }
  | { kind: 'segment'; seg: number }

const LIST: Record<'trigger' | 'item' | 'prop', ListKey> = { trigger: 'triggers', item: 'items', prop: 'props' }

/** Snap to tenths of a unit (X) and twentieths of the lane (depth), so dragged values stay readable. */
export const snapX = (x: number) => Math.round(x * 10) / 10
export const snapDepth = (d: number) => Math.min(1, Math.max(0, Math.round(d * 20) / 20))

/** Where each segment starts, plus the level's end as the last entry. */
export const segmentStarts = (level: Level): number[] => {
  const starts = [0]
  for (const s of level.segments) starts.push(starts[starts.length - 1] + s.length)
  return starts
}

/** The segment holding absolute `x` (a boundary belongs to the later segment, the level's end to the last). */
export const segmentAt = (level: Level, x: number): { seg: number; offset: number } => {
  const starts = segmentStarts(level)
  const end = starts[starts.length - 1]
  const cx = Math.min(Math.max(0, x), end)
  let seg = level.segments.length - 1
  for (let i = 0; i < level.segments.length; i++) {
    if (cx < starts[i + 1]) {
      seg = i
      break
    }
  }
  return { seg, offset: snapX(cx - starts[seg]) }
}

const list = <T>(s: Segment, key: ListKey): T[] => ((s[key] ?? []) as unknown[]) as T[]

const withSegment = (level: Level, seg: number, fn: (s: Segment) => Segment): Level => ({
  ...level,
  segments: level.segments.map((s, i) => (i === seg ? fn(s) : s)),
})

const setList = (s: Segment, key: ListKey, items: unknown[]): Segment => {
  const next = { ...s, [key]: items } as Segment
  // Optional lists that end up empty are left out, as hand-written content does.
  if (key !== 'triggers' && items.length === 0) delete next[key]
  return next
}

/** A drawable object: its ref, absolute X and depth (0 back to 1 front), when it has one. */
export interface LevelObject {
  ref: LevelRef
  x: number
  depth?: number
}

/** Every object in the level with its absolute position. */
export const levelObjects = (level: Level): LevelObject[] => {
  const out: LevelObject[] = []
  const starts = segmentStarts(level)
  level.segments.forEach((s, seg) => {
    s.triggers.forEach((t, index) => {
      const tx = starts[seg] + t.at
      out.push({ ref: { kind: 'trigger', seg, index }, x: tx })
      if (t.kind !== 'wave') return
      t.waves.forEach((w, wave) =>
        w.enemies.forEach((e, enemy) => {
          if (e.from === 'placed') out.push({ ref: { kind: 'enemy', seg, index, wave, enemy }, x: tx + (e.x ?? 0), depth: e.depth ?? 0.5 })
        })
      )
    })
    list<LevelItem>(s, 'items').forEach((it, index) => out.push({ ref: { kind: 'item', seg, index }, x: starts[seg] + it.at, depth: it.depth ?? 0.5 }))
    list<PropPlacement>(s, 'props').forEach((p, index) => out.push({ ref: { kind: 'prop', seg, index }, x: starts[seg] + p.at, depth: p.depth ?? 0.5 }))
  })
  return out
}

/** The content a ref points at (a trigger, item, prop, spawn or segment), or undefined. */
export const getObject = (level: Level, ref: LevelRef): unknown => {
  const s = level.segments[ref.seg]
  if (!s) return undefined
  if (ref.kind === 'segment') return s
  if (ref.kind === 'enemy') {
    const t = s.triggers[ref.index]
    return t?.kind === 'wave' ? t.waves[ref.wave]?.enemies[ref.enemy] : undefined
  }
  return list(s, LIST[ref.kind])[ref.index]
}

/** The content path of a ref inside its level, for matching validation errors. */
export const refPath = (ref: LevelRef): (string | number)[] => {
  if (ref.kind === 'segment') return ['segments', ref.seg]
  if (ref.kind === 'enemy') return ['segments', ref.seg, 'triggers', ref.index, 'waves', ref.wave, 'enemies', ref.enemy]
  return ['segments', ref.seg, LIST[ref.kind], ref.index]
}

/** Replace the object a ref points at. */
export const setObject = (level: Level, ref: LevelRef, value: unknown): Level => {
  if (ref.kind === 'segment') return withSegment(level, ref.seg, () => value as Segment)
  if (ref.kind === 'enemy')
    return withSegment(level, ref.seg, (s) => ({
      ...s,
      triggers: s.triggers.map((t, i) =>
        i === ref.index && t.kind === 'wave'
          ? {
              ...t,
              waves: t.waves.map((w, wi) => (wi === ref.wave ? { enemies: w.enemies.map((e, ei) => (ei === ref.enemy ? (value as SpawnDef) : e)) } : w)),
            }
          : t
      ),
    }))
  const key = LIST[ref.kind]
  return withSegment(level, ref.seg, (s) => setList(s, key, list(s, key).map((o, i) => (i === ref.index ? value : o))))
}

/**
 * Move an object to absolute `x` (and `depth`, for objects with one). A
 * trigger, item or prop crossing a segment boundary moves into that segment;
 * a placed enemy stays in its fight, at an offset from it. Returns the new
 * level and the object's new ref.
 */
export const moveObject = (level: Level, ref: LevelRef, x: number, depth?: number): { level: Level; ref: LevelRef } => {
  if (ref.kind === 'segment') return { level, ref }
  const obj = getObject(level, ref) as Record<string, unknown> | undefined
  if (!obj) return { level, ref }
  const withDepth = (o: Record<string, unknown>) => (depth === undefined || ref.kind === 'trigger' ? o : { ...o, depth: snapDepth(depth) })
  if (ref.kind === 'enemy') {
    const tx = segmentStarts(level)[ref.seg] + level.segments[ref.seg].triggers[ref.index].at
    return { level: setObject(level, ref, withDepth({ ...obj, x: snapX(x - tx) })), ref }
  }
  const key = LIST[ref.kind]
  const to = segmentAt(level, x)
  const moved = withDepth({ ...obj, at: to.offset })
  if (to.seg === ref.seg) return { level: setObject(level, ref, moved), ref }
  let next = withSegment(level, ref.seg, (s) => setList(s, key, list(s, key).filter((_, i) => i !== ref.index)))
  next = withSegment(next, to.seg, (s) => setList(s, key, [...list(s, key), moved]))
  return { level: next, ref: { kind: ref.kind, seg: to.seg, index: list(next.segments[to.seg], key).length - 1 } }
}

export type NewObject =
  | { kind: 'wave'; enemyType: string }
  | { kind: 'goal' }
  | { kind: 'item'; pickup: string; depth?: number }
  | { kind: 'prop'; prop: string; depth?: number }

/** Add an object at absolute `x`; returns the new level and its ref. */
export const addObject = (level: Level, x: number, what: NewObject): { level: Level; ref: LevelRef } => {
  const { seg, offset: at } = segmentAt(level, x)
  const push = (key: ListKey, value: unknown, kind: 'trigger' | 'item' | 'prop') => {
    const next = withSegment(level, seg, (s) => setList(s, key, [...list(s, key), value]))
    return { level: next, ref: { kind, seg, index: list(next.segments[seg], key).length - 1 } as LevelRef }
  }
  switch (what.kind) {
    case 'wave': {
      const t: Trigger = { kind: 'wave', at, lock: true, waves: [{ enemies: [{ type: what.enemyType, from: 'right' }] }] }
      return push('triggers', t, 'trigger')
    }
    case 'goal':
      return push('triggers', { kind: 'goal', at } satisfies Trigger, 'trigger')
    case 'item':
      return push('items', { at, pickup: what.pickup, depth: snapDepth(what.depth ?? 0.5) } satisfies LevelItem, 'item')
    case 'prop':
      return push('props', { at, prop: what.prop, depth: snapDepth(what.depth ?? 0.5) } satisfies PropPlacement, 'prop')
  }
}

/** Remove an object. Removing a fight's last enemy removes the fight; a segment goes with its contents. */
export const removeObject = (level: Level, ref: LevelRef): Level => {
  if (ref.kind === 'segment') return removeSegment(level, ref.seg)
  if (ref.kind === 'enemy') {
    const t = level.segments[ref.seg]?.triggers[ref.index]
    if (t?.kind !== 'wave') return level
    const waves: Wave[] = t.waves
      .map((w, wi) => (wi === ref.wave ? { enemies: w.enemies.filter((_, ei) => ei !== ref.enemy) } : w))
      .filter((w) => w.enemies.length > 0)
    if (waves.length === 0) return removeObject(level, { kind: 'trigger', seg: ref.seg, index: ref.index })
    return setObject(level, { kind: 'trigger', seg: ref.seg, index: ref.index }, { ...t, waves })
  }
  const key = LIST[ref.kind]
  return withSegment(level, ref.seg, (s) => setList(s, key, list(s, key).filter((_, i) => i !== ref.index)))
}

/** The furthest `at` used inside a segment (its length can't go below this). */
export const segmentContentEnd = (s: Segment): number =>
  Math.max(0, ...s.triggers.map((t) => t.at), ...list<LevelItem>(s, 'items').map((i) => i.at), ...list<PropPlacement>(s, 'props').map((p) => p.at))

/** Change a segment's length; what's inside keeps its place in the segment, later segments shift. */
export const resizeSegment = (level: Level, seg: number, length: number): Level =>
  withSegment(level, seg, (s) => ({ ...s, length: Math.max(1, segmentContentEnd(s), snapX(length)) }))

/** Split the segment at absolute `x` in two; everything past the cut goes to the new segment. */
export const splitSegment = (level: Level, x: number): Level => {
  const { seg, offset } = segmentAt(level, x)
  const s = level.segments[seg]
  if (offset <= 0 || offset >= s.length) return level
  const part = (key: ListKey, after: boolean) =>
    list<{ at: number }>(s, key)
      .filter((o) => (o.at >= offset) === after)
      .map((o) => (after ? { ...o, at: snapX(o.at - offset) } : o))
  let a: Segment = { ...s, length: offset, triggers: part('triggers', false) as Trigger[] }
  let b: Segment = { length: snapX(s.length - offset), triggers: part('triggers', true) as Trigger[] }
  for (const key of ['items', 'props'] as const) {
    a = setList(a, key, part(key, false))
    b = setList(b, key, part(key, true))
  }
  return { ...level, segments: [...level.segments.slice(0, seg), a, b, ...level.segments.slice(seg + 1)] }
}

/** Add an empty segment at the end. */
export const addSegment = (level: Level, length = 20): Level => ({ ...level, segments: [...level.segments, { length, triggers: [] }] })

/** Remove a segment and what's in it (a level keeps at least one). */
export const removeSegment = (level: Level, seg: number): Level =>
  level.segments.length <= 1 ? level : { ...level, segments: level.segments.filter((_, i) => i !== seg) }

/** An empty level to build from scratch: one screen-long segment with a goal at its end. */
export const blankLevel = (theme = 'default'): Omit<Level, 'id' | 'name'> => ({
  theme,
  segments: [{ length: 40, triggers: [{ kind: 'goal', at: 38 }] }],
})

/**
 * The level as played from absolute `x`: everything more than `spawnX`
 * behind it is cut off and the rest shifted so the player, who starts at
 * `spawnX`, stands at `x`. Fights and goals behind the player are dropped
 * (they would fire on the first step).
 */
export const levelFrom = (level: Level, x: number, spawnX: number): Level => {
  const cut = Math.max(0, snapX(x - spawnX))
  const keepTriggerFrom = cut > 0 ? snapX(x) : 0
  const starts = segmentStarts(level)
  const segments: Segment[] = []
  level.segments.forEach((s, i) => {
    const start = starts[i]
    const end = starts[i + 1]
    if (end <= cut) return
    const offset = Math.max(0, cut - start)
    const keep = <T extends { at: number }>(arr: T[] | undefined, min: number) =>
      (arr ?? []).filter((o) => start + o.at >= min).map((o) => ({ ...o, at: snapX(o.at - offset) }))
    let seg: Segment = { length: snapX(s.length - offset), triggers: keep(s.triggers, keepTriggerFrom) }
    seg = setList(seg, 'items', keep(s.items, cut))
    seg = setList(seg, 'props', keep(s.props, cut))
    segments.push(seg)
  })
  if (segments.length === 0) return level
  return { ...level, segments }
}
