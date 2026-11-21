// Level runtime: an ordered list of segments with triggers that spawn enemy
// waves, lock the camera until a fight is won, and end the level at a goal.
// Pure TS so whole levels can be played headless in tests. The data shapes
// here are the draft of the future content schema (roadmap M2.1).

import type { EnemyType } from '../types/game'
import type { PropPlacement } from './props'

export interface SpawnDef {
  type: EnemyType
  /**
   * `right` / `left`: walk in from just off that screen edge.
   * `placed`: stand at `x` (offset from the trigger) from the start.
   */
  from: 'right' | 'left' | 'placed'
  /** For `placed`: X offset from the trigger point. */
  x?: number
  /** Position across the depth lane: 0 = back, 1 = front. Random if omitted. */
  depth?: number
  /** Seconds after the wave starts. */
  delay?: number
}

export interface Wave {
  enemies: SpawnDef[]
}

export type Trigger =
  | {
      kind: 'wave'
      /** X offset inside the segment; fires when the player reaches it. */
      at: number
      /** Hold the camera until every wave is cleared (a "screen lock"). */
      lock?: boolean
      /** Played in order; each starts when the previous one is cleared. */
      waves: Wave[]
    }
  | {
      kind: 'goal'
      at: number
    }
  | BossTrigger

/**
 * A boss fight: locks the screen, brings in the boss (an enemy type with a
 * `boss` block) with an optional name card and its own music, and by default
 * ends the level when the boss is beaten.
 */
export interface BossTrigger {
  kind: 'boss'
  at: number
  /** Enemy type id; must have a `boss` block. */
  enemy: EnemyType
  from: 'right' | 'left' | 'placed'
  /** For `placed`: X offset from the trigger point. */
  offset?: number
  /** Position across the depth lane: 0 = back, 1 = front (default middle). */
  depth?: number
  /** Music id played while the boss is alive. */
  music?: string
  /** Show the boss's name card (default true). */
  intro?: boolean
  /** Beating the boss completes the level (default true); otherwise the screen unlocks. */
  endsLevel?: boolean
}

/** Whether beating this boss ends the level. */
export const bossEndsLevel = (t: BossTrigger): boolean => t.endsLevel !== false

/** A pickup lying on the stage from the start. */
export interface LevelItem {
  /** X offset inside the segment. */
  at: number
  /** Pickup id in the content's `pickups`. */
  pickup: string
  /** Position across the depth lane: 0 = back, 1 = front (default middle). */
  depth?: number
}

export interface Segment {
  length: number
  triggers: Trigger[]
  items?: LevelItem[]
  /** Stage objects from the content's prop library. */
  props?: PropPlacement[]
}

export interface Level {
  id: string
  name: string
  /** Theme id in the content's `themes`: how the stage looks. */
  theme: string
  /** Music id in the content's `music`, looping while the level plays. */
  music?: string
  segments: Segment[]
}

/** Every level item with its absolute X, and a stable id (so placing twice doesn't duplicate). */
export const placeItems = (level: Level): { id: string; pickup: string; x: number; depth: number }[] => {
  const out: { id: string; pickup: string; x: number; depth: number }[] = []
  let start = 0
  level.segments.forEach((seg, si) => {
    seg.items?.forEach((it, ii) =>
      out.push({ id: `item-${si}-${ii}`, pickup: it.pickup, x: start + it.at, depth: it.depth ?? 0.5 })
    )
    start += seg.length
  })
  return out
}

/** Every placed prop with its absolute X and a stable id. */
export const placeProps = (level: Level): { id: string; prop: string; x: number; y: number; depth: number }[] => {
  const out: { id: string; prop: string; x: number; y: number; depth: number }[] = []
  let start = 0
  level.segments.forEach((seg, si) => {
    seg.props?.forEach((p, pi) =>
      out.push({ id: `prop-${si}-${pi}`, prop: p.prop, x: start + p.at, y: p.y ?? 0, depth: p.depth ?? 0.5 })
    )
    start += seg.length
  })
  return out
}

/** A trigger with its absolute X on the level. */
export type PlacedTrigger = Trigger & { x: number }

export const levelLength = (level: Level): number =>
  level.segments.reduce((sum, s) => sum + s.length, 0)

/** All triggers with absolute X, in the order the player reaches them. */
export const placeTriggers = (level: Level): PlacedTrigger[] => {
  const placed: PlacedTrigger[] = []
  let start = 0
  for (const seg of level.segments) {
    for (const t of seg.triggers) placed.push({ ...t, x: start + t.at })
    start += seg.length
  }
  // Stable sort keeps authoring order for triggers at the same X.
  return placed.map((t, i) => ({ t, i })).sort((a, b) => a.t.x - b.t.x || a.i - b.i).map((e) => e.t)
}

/** Problems a creator would want to hear about; empty when the level is fine. */
export const validateLevel = (level: Level): string[] => {
  const errors: string[] = []
  if (level.segments.length === 0) errors.push('Level has no segments.')
  level.segments.forEach((seg, si) => {
    if (!(seg.length > 0)) errors.push(`Segment ${si + 1} needs a positive length.`)
    seg.items?.forEach((it, ii) => {
      if (it.at < 0 || it.at > seg.length) errors.push(`Segment ${si + 1}, item ${ii + 1} is outside its segment.`)
    })
    seg.triggers.forEach((t, ti) => {
      const where = `Segment ${si + 1}, trigger ${ti + 1}`
      if (t.at < 0 || t.at > seg.length) errors.push(`${where} is outside its segment.`)
      if (t.kind === 'wave') {
        if (t.waves.length === 0) errors.push(`${where} has no waves.`)
        t.waves.forEach((w, wi) => {
          if (w.enemies.length === 0) errors.push(`${where}, wave ${wi + 1} has no enemies.`)
        })
      }
    })
  })
  const triggers = level.segments.flatMap((s) => s.triggers)
  const goals = triggers.filter((t) => t.kind === 'goal')
  const endingBosses = triggers.filter((t) => t.kind === 'boss' && bossEndsLevel(t))
  if (goals.length > 1 || (goals.length === 0 && endingBosses.length === 0))
    errors.push(`Level needs exactly one goal, or a boss that ends it (found ${goals.length} goals).`)
  return errors
}

interface QueuedSpawn {
  def: SpawnDef
  delayLeft: number
}

export interface Encounter {
  trigger: Extract<PlacedTrigger, { kind: 'wave' }>
  waveIndex: number
  queue: QueuedSpawn[]
  /** Ids spawned for the current wave. */
  spawned: string[]
}

/** The boss fight under way. */
export interface BossFight {
  trigger: Extract<PlacedTrigger, { kind: 'boss' }>
  id: string
  /** Spawned this step: the caller's view of who is alive may predate it. */
  fresh: boolean
}

export interface LevelRuntime {
  triggers: PlacedTrigger[]
  /** The boss fight under way, if any. */
  boss: BossFight | null
  /** Index of the next trigger not yet reached. */
  next: number
  encounters: Encounter[]
  /** X the camera is locked at, if a locking encounter is active. */
  lockX: number | null
  complete: boolean
}

export const createLevelRuntime = (level: Level): LevelRuntime => ({
  triggers: placeTriggers(level),
  boss: null,
  next: 0,
  encounters: [],
  lockX: null,
  complete: false,
})

export type LevelEvent =
  | { kind: 'lock'; x: number }
  | { kind: 'unlock' }
  | { kind: 'waveStart'; triggerX: number; wave: number; of: number }
  | { kind: 'bossStart'; id: string; trigger: BossTrigger }
  | { kind: 'bossDefeated'; id: string; endsLevel: boolean }
  | { kind: 'complete' }

export interface LevelStepInput {
  playerX: number
  /** Where the camera is now; a lock holds it here. */
  cameraX: number
  isAlive: (id: string) => boolean
  /** Creates the enemy and returns its id. */
  spawn: (def: SpawnDef, triggerX: number) => string
}

const anyLock = (rt: LevelRuntime) => rt.boss !== null || rt.encounters.some((e) => e.trigger.lock)

const queueWave = (enc: Encounter) => {
  enc.queue = enc.trigger.waves[enc.waveIndex].enemies.map((def) => ({
    def,
    delayLeft: def.delay ?? 0,
  }))
  enc.spawned = []
}

/**
 * Advances the level by `dt`: fires reached triggers, releases queued spawns,
 * moves encounters to their next wave when one is cleared, and reports camera
 * lock/unlock and completion. Mutates `rt`.
 */
export const stepLevel = (rt: LevelRuntime, input: LevelStepInput, dt: number): LevelEvent[] => {
  const events: LevelEvent[] = []
  if (rt.complete) return events

  while (rt.next < rt.triggers.length && input.playerX >= rt.triggers[rt.next].x) {
    // A goal inside a locked screen waits until the fight is won.
    if (rt.triggers[rt.next].kind === 'goal' && rt.lockX !== null) break
    const t = rt.triggers[rt.next++]
    if (t.kind === 'goal') {
      rt.complete = true
      events.push({ kind: 'complete' })
      return events
    }
    if (t.kind === 'boss') {
      if (rt.boss) continue // One boss at a time; a second one behind it is skipped.
      const id = input.spawn({ type: t.enemy, from: t.from, x: t.offset ?? 0, depth: t.depth ?? 0.5 }, t.x)
      rt.boss = { trigger: t, id, fresh: true }
      events.push({ kind: 'bossStart', id, trigger: t })
      if (rt.lockX === null) {
        rt.lockX = input.cameraX
        events.push({ kind: 'lock', x: input.cameraX })
      }
      continue
    }
    const enc: Encounter = { trigger: t, waveIndex: 0, queue: [], spawned: [] }
    queueWave(enc)
    rt.encounters.push(enc)
    events.push({ kind: 'waveStart', triggerX: t.x, wave: 1, of: t.waves.length })
    if (t.lock && rt.lockX === null) {
      rt.lockX = input.cameraX
      events.push({ kind: 'lock', x: input.cameraX })
    }
  }

  for (const enc of rt.encounters) {
    for (const q of enc.queue) q.delayLeft -= dt
    const ready = enc.queue.filter((q) => q.delayLeft <= 1e-9)
    enc.queue = enc.queue.filter((q) => q.delayLeft > 1e-9)
    // Enemies spawned this step count as alive: the caller's view of who is
    // alive may predate them (a wave with no delays spawns and checks at once).
    const fresh = ready.map((q) => input.spawn(q.def, enc.trigger.x))
    enc.spawned.push(...fresh)

    const cleared = enc.queue.length === 0 && fresh.length === 0 && enc.spawned.every((id) => !input.isAlive(id))
    if (!cleared) continue
    enc.waveIndex++
    if (enc.waveIndex < enc.trigger.waves.length) {
      queueWave(enc)
      events.push({
        kind: 'waveStart',
        triggerX: enc.trigger.x,
        wave: enc.waveIndex + 1,
        of: enc.trigger.waves.length,
      })
    }
  }

  // The boss is down. The step it arrives counts it alive, as with wave spawns.
  let bossDown = false
  if (rt.boss?.fresh) rt.boss.fresh = false
  else if (rt.boss && !input.isAlive(rt.boss.id)) {
    const ends = bossEndsLevel(rt.boss.trigger)
    events.push({ kind: 'bossDefeated', id: rt.boss.id, endsLevel: ends })
    rt.boss = null
    bossDown = true
    if (ends) {
      rt.complete = true
      events.push({ kind: 'complete' })
      return events
    }
  }

  const done = rt.encounters.filter((e) => e.waveIndex >= e.trigger.waves.length)
  rt.encounters = rt.encounters.filter((e) => e.waveIndex < e.trigger.waves.length)
  if (rt.lockX !== null && (bossDown || done.some((e) => e.trigger.lock)) && !anyLock(rt)) {
    rt.lockX = null
    events.push({ kind: 'unlock' })
  }
  return events
}
