// The players in a scene: their bodies and where they stand. GameScene owns
// one; the systems that used to read "the player" read every player here.

import { createRef, type RefObject } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { isPlayerId, playerId, type TargetCandidate } from '../sim/players'

export interface ScenePlayers {
  /** Each player's body, by player id (`p1`, `p2`). */
  refs: Map<string, RefObject<RapierRigidBody>>
  /**
   * Each player's position, copied from its body every rendered frame (even
   * paused), so the camera and enemy AI read the latest value.
   */
  positions: Map<string, Vector3>
}

/** The scene's players, starting where the player spawns. */
export const createScenePlayers = (slots: readonly number[], spawn: readonly [number, number, number]): ScenePlayers => {
  const players: ScenePlayers = { refs: new Map(), positions: new Map() }
  for (const slot of slots) {
    players.refs.set(playerId(slot), createRef<RapierRigidBody>())
    players.positions.set(playerId(slot), new Vector3(...spawn))
  }
  return players
}

/** The body ref for a player id, made on first use. */
export const playerRef = (players: ScenePlayers, id: string): RefObject<RapierRigidBody> => {
  let ref = players.refs.get(id)
  if (!ref) {
    ref = createRef<RapierRigidBody>()
    players.refs.set(id, ref)
  }
  return ref
}

/** A fighter's body by name: a player's or an enemy's. */
export const fighterBody = (
  players: ScenePlayers,
  enemyRefs: Map<string, RefObject<RapierRigidBody>>,
  name: string
): RapierRigidBody | null => (isPlayerId(name) ? players.refs.get(name)?.current : enemyRefs.get(name)?.current) ?? null

/** Ids of the players still in the game (not out of lives), read live from the store. */
export const activePlayerIds = (): string[] =>
  useGameStore
    .getState()
    .players.filter((p) => p.lives > 0)
    .map((p) => playerId(p.slot))

/** The players still in, where they stand, for the enemy AI to choose from. */
export const playerTargets = (players: ScenePlayers): TargetCandidate[] =>
  activePlayerIds().flatMap((id) => {
    const p = players.positions.get(id)
    return p ? [{ id, x: p.x, z: p.z }] : []
  })

/** Copies every player's body position into `positions`. */
export const trackPlayers = (players: ScenePlayers): void => {
  players.refs.forEach((ref, id) => {
    const body = ref.current
    if (!body) return
    const t = body.translation()
    const v = players.positions.get(id)
    if (v) v.set(t.x, t.y, t.z)
    else players.positions.set(id, new Vector3(t.x, t.y, t.z))
  })
}
