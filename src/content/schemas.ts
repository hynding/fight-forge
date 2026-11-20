// Content schemas: the shape of a content pack, as zod schemas with the TS
// types derived from them. A pack is pure data (no code), so the same
// validation can run on load, in the editor, and later on upload.
//
// The definitions mirror the runtime types in `src/config/defaults.ts` and
// `src/sim/*` field for field; `typeChecks` at the bottom fails to compile if
// they drift apart. Times are seconds of game time, distances world units.

import { z } from 'zod'

/** The pack format version this build reads. Bump it with a migration (M2.3). */
export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------- primitives

/** Ids name definitions inside a pack: letters, digits, `_` and `-`, starting with a letter. */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'must start with a letter and use only letters, digits, _ and -')

const finite = z.number().finite()
const nonNegative = finite.min(0)
const positive = finite.positive()
const fraction = finite.min(0).max(1)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour')
const vec3 = z.tuple([finite, finite, finite])
const halfExtents = z.tuple([positive, positive, positive])

// ------------------------------------------------------------------- assets

export const assetSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['model', 'texture', 'audio']),
    /** Path inside the pack bundle. */
    path: z.string().min(1),
    /** Hex SHA-256 of the file, checked when a bundle loads (M2.3). */
    hash: z.string().regex(/^[0-9a-f]{64}$/, 'must be a hex SHA-256').optional(),
    bytes: z.number().int().nonnegative().optional(),
  })
  .strict()

// ------------------------------------------------------------ models, clips

export const fighterStateSchema = z.enum([
  'idle',
  'walk',
  'run',
  'jump',
  'attack',
  'block',
  'dodge',
  'hitstun',
  'knockdown',
  'getup',
  'dead',
])

export const clipRefSchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), speed: positive.optional() }).strict(),
])

export const clipMapSchema = z.record(fighterStateSchema, clipRefSchema)

export const modelRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('procedural'), offset: vec3 }).strict(),
  z
    .object({
      kind: z.literal('gltf'),
      /** A URL (files in `public/` are served from the site root)... */
      url: z.string().min(1).optional(),
      /** ...or a model asset of the pack. Exactly one of the two. */
      asset: idSchema.optional(),
      scale: positive,
      offset: vec3,
      rotationY: finite,
      tintMaterials: z.array(z.string()),
      clips: clipMapSchema,
    })
    .strict(),
]).superRefine((m, ctx) => {
  if (m.kind === 'gltf' && (m.url === undefined) === (m.asset === undefined))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'needs exactly one of "url" or "asset"' })
})

// -------------------------------------------------------------------- moves

export const hitboxSchema = z
  .object({ forward: finite, up: finite, halfX: positive, halfY: positive, halfZ: positive })
  .strict()

export const hitReactionSchema = z
  .object({
    hitstun: nonNegative,
    knockback: z.object({ x: finite, y: finite }).strict(),
    knockdown: z.boolean().optional(),
  })
  .strict()

export const moveSchema = z
  .object({
    startup: nonNegative,
    active: positive,
    recovery: nonNegative,
    damage: nonNegative,
    hitbox: hitboxSchema,
    reaction: hitReactionSchema,
    clip: clipRefSchema.optional(),
    air: z.boolean().optional(),
    lunge: nonNegative.optional(),
    /** Move id a buffered press chains into. */
    next: idSchema.optional(),
    cancelFrom: nonNegative.optional(),
  })
  .strict()

// ---------------------------------------------------- AI, pickups, enemies

export const aiBehaviorSchema = z
  .object({
    approach: z.enum(['beside', 'behind']),
    reach: positive,
    standOff: positive,
    attackFrom: z.enum(['any', 'behind']),
  })
  .strict()

export const pickupSchema = z
  .object({ effect: z.enum(['heal', 'score']), amount: nonNegative, color, size: positive })
  .strict()

export const dropSchema = z.object({ pickup: idSchema, chance: fraction }).strict()

export const enemyTypeSchema = z
  .object({
    maxHealth: positive,
    scale: positive,
    speed: nonNegative,
    aggression: nonNegative,
    /** AI archetype id (`ai`). */
    ai: idSchema,
    /** Move id; defaults to `enemy.attackMove`. */
    attackMove: idSchema.optional(),
    armor: nonNegative.optional(),
    drop: dropSchema.optional(),
    color,
    model: modelRefSchema,
    colliderHalfExtents: halfExtents.optional(),
  })
  .strict()

// ----------------------------------------------------------------- settings

/** Tuning sections. A pack may leave sections out to inherit them from packs loaded before it. */
export const settingsSchema = z
  .object({
    physics: z.object({ gravity: vec3 }).strict(),
    body: z
      .object({
        colliderHalfExtents: halfExtents,
        groundRayLength: positive,
        groundedMaxVelY: nonNegative,
        stopSpeed: nonNegative,
      })
      .strict(),
    player: z
      .object({
        maxHealth: positive,
        color,
        model: modelRefSchema,
        colliderHalfExtents: halfExtents.optional(),
        spawnPosition: vec3,
        walkSpeed: nonNegative,
        jumpVelocity: nonNegative,
        deceleration: fraction,
        linearDamping: nonNegative,
        lightAttack: idSchema,
        jumpAttack: idSchema,
        dashAttack: idSchema,
      })
      .strict(),
    enemy: z
      .object({
        aggroRange: nonNegative,
        depthTolerance: nonNegative,
        maxSimultaneousAttackers: z.number().int().min(1),
        attackMove: idSchema,
        attackSlotDuration: positive,
        attackSlotRecovery: nonNegative,
        deceleration: fraction,
        minSpacing: nonNegative,
        crowdedThreshold: nonNegative,
        avoidanceWeight: fraction,
        circleSpeedFactor: nonNegative,
        linearDamping: nonNegative,
        patrol: z
          .object({
            retargetInterval: positive,
            minDistance: nonNegative,
            maxDistance: nonNegative,
            speedFactor: nonNegative,
            arriveDistance: positive,
          })
          .strict()
          .refine((p) => p.minDistance <= p.maxDistance, {
            message: 'minDistance must not exceed maxDistance',
          }),
      })
      .strict(),
    reactions: z
      .object({
        knockdownDuration: nonNegative,
        getupDuration: nonNegative,
        getupInvulnerability: nonNegative,
        knockbackFriction: fraction,
      })
      .strict(),
    actions: z
      .object({
        run: z.object({ speedFactor: positive, doubleTapWindow: positive }).strict(),
        block: z.object({ damageFactor: fraction, blockstun: nonNegative, knockbackFactor: nonNegative }).strict(),
        dodge: z.object({ duration: positive, speed: nonNegative, cooldown: nonNegative }).strict(),
      })
      .strict(),
    spawning: z.object({ offscreenMargin: nonNegative, height: nonNegative }).strict(),
    camera: z
      .object({
        height: finite,
        distance: positive,
        lookAtHeight: finite,
        lookAtDepth: finite,
        fov: finite.gt(0).lt(180),
        deadZone: nonNegative,
        allowBacktrack: z.boolean(),
        edgeMargin: nonNegative,
      })
      .strict(),
    stage: z
      .object({
        depthBand: z.tuple([finite, finite]).refine(([a, b]) => a < b, { message: 'min must be below max' }),
        floorThickness: positive,
        wallHeight: positive,
        wallThickness: positive,
      })
      .strict(),
    scoring: z.object({ enemyKill: nonNegative }).strict(),
    rules: z
      .object({
        lives: z.number().int().min(1),
        continues: z.number().int().min(0),
        respawnInvulnerability: nonNegative,
        pickupRadius: positive,
      })
      .strict(),
  })
  .strict()

// ------------------------------------------------------------------- levels

export const spawnSchema = z
  .object({
    /** Enemy type id. */
    type: idSchema,
    from: z.enum(['right', 'left', 'placed']),
    x: finite.optional(),
    depth: fraction.optional(),
    delay: nonNegative.optional(),
  })
  .strict()
  .refine((s) => s.from !== 'placed' || s.x !== undefined, { message: 'a placed spawn needs "x"', path: ['x'] })

export const waveSchema = z.object({ enemies: z.array(spawnSchema).min(1) }).strict()

export const triggerSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('wave'), at: nonNegative, lock: z.boolean().optional(), waves: z.array(waveSchema).min(1) })
    .strict(),
  z.object({ kind: z.literal('goal'), at: nonNegative }).strict(),
])

export const levelItemSchema = z.object({ at: nonNegative, pickup: idSchema, depth: fraction.optional() }).strict()

export const segmentSchema = z
  .object({ length: positive, triggers: z.array(triggerSchema), items: z.array(levelItemSchema).optional() })
  .strict()

export const levelSchema = z
  .object({ id: idSchema, name: z.string().min(1), segments: z.array(segmentSchema).min(1) })
  .strict()

// --------------------------------------------------------------------- pack

export const packMetaSchema = z
  .object({
    author: z.string().min(1),
    description: z.string(),
    license: z.string().min(1),
    /** Image asset id. */
    cover: idSchema.optional(),
  })
  .strict()

export const packSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: idSchema,
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a version like 1.0.0'),
    meta: packMetaSchema,
    assets: z.array(assetSchema).default([]),
    settings: settingsSchema.partial().default({}),
    moves: z.record(idSchema, moveSchema).default({}),
    ai: z.record(idSchema, aiBehaviorSchema).default({}),
    enemyTypes: z.record(idSchema, enemyTypeSchema).default({}),
    pickups: z.record(idSchema, pickupSchema).default({}),
    /** In play order. A level with the same id as an earlier pack's replaces it in place. */
    levels: z.array(levelSchema).default([]),
  })
  .strict()

// -------------------------------------------------------------------- types

export type AssetDef = z.infer<typeof assetSchema>
export type ModelRefDef = z.infer<typeof modelRefSchema>
export type MoveDefData = z.infer<typeof moveSchema>
export type AiBehaviorDef = z.infer<typeof aiBehaviorSchema>
export type PickupDefData = z.infer<typeof pickupSchema>
export type EnemyTypeData = z.infer<typeof enemyTypeSchema>
export type Settings = z.infer<typeof settingsSchema>
export type LevelDef = z.infer<typeof levelSchema>
export type PackMeta = z.infer<typeof packMetaSchema>
/** A pack after parsing (defaults filled in). */
export type Pack = z.infer<typeof packSchema>
/** A pack as written in JSON (sections may be left out). */
export type PackInput = z.input<typeof packSchema>
