// Compile-time checks that the content schemas and the runtime types agree.
// If a field is added to one side only, `npm run build` (tsc) fails here.
// Nothing in this file runs.

import type { EnemyTypeDef, GameConfig, ModelRef } from '../config/defaults'
import type { AiBehavior } from '../sim/controllers'
import type { Level } from '../sim/level'
import type { MoveDef } from '../sim/moves'
import type { PickupDef } from '../sim/pickups'
import type { AiBehaviorDef, EnemyTypeData, LevelDef, ModelRefDef, MoveDefData, PickupDefData, Settings } from './schemas'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Check<T extends true> = T

// The schema's gltf model may name a pack asset instead of a URL; otherwise identical.
type RuntimeModelData = Exclude<ModelRef, { kind: 'gltf' }> | (Omit<Extract<ModelRef, { kind: 'gltf' }>, 'url'> & { url?: string; asset?: string })
type Runtime<T> = { [K in keyof T]: T[K] extends ModelRef ? RuntimeModelData : T[K] }
type SettingsKeys = Exclude<keyof GameConfig, 'enemyTypes' | 'ai' | 'moves' | 'pickups'>

export type ContentTypeChecks = [
  Check<Same<MoveDefData, MoveDef>>,
  Check<Same<PickupDefData, PickupDef>>,
  Check<Same<AiBehaviorDef, AiBehavior>>,
  Check<Same<ModelRefDef, RuntimeModelData>>,
  Check<Same<Omit<EnemyTypeData, 'model'>, Omit<EnemyTypeDef, 'model'>>>,
  Check<Same<keyof Settings, SettingsKeys>>,
  Check<Same<Omit<Settings, 'player'>, Omit<Pick<GameConfig, SettingsKeys>, 'player'>>>,
  Check<Same<Omit<Settings['player'], 'model'>, Omit<GameConfig['player'], 'model'>>>,
  Check<Same<LevelDef, Level>>,
  Check<Same<Runtime<{ m: ModelRef }>['m'], RuntimeModelData>>,
]
