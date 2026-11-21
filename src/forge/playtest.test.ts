import { describe, expect, it } from 'vitest'
import type { Level } from '../sim/level'
import { placeTriggers } from '../sim/level'
import { levelCut, levelFrom } from './level'
import { packLevel, planResume } from './playtest'
import { newPack, type PackJson } from './workspace'
import { useGameStore, isFrozen } from '../store/gameStore'

const level = (enemies = 1): Level => ({
  id: 'mine',
  name: 'Mine',
  theme: 'default',
  segments: [
    {
      length: 60,
      triggers: [
        { kind: 'wave', at: 10, lock: true, waves: [{ enemies: Array.from({ length: enemies }, () => ({ type: 'BASIC', from: 'right' as const })) }] },
        { kind: 'wave', at: 30, waves: [{ enemies: [{ type: 'BASIC', from: 'left' }] }] },
        { kind: 'goal', at: 58 },
      ],
    },
  ],
})
const withLevel = (l: Level): PackJson => ({ ...newPack('P', []).json, levels: [l] })

describe('forge playtest loop', () => {
  it('finds a level in the pack or the default pack', () => {
    expect(packLevel(withLevel(level()), 'mine')?.name).toBe('Mine')
    expect(packLevel(withLevel(level()), 'level-1')?.id).toBe('level-1')
    expect(packLevel(withLevel(level()), 'nope')).toBeUndefined()
  })

  it('resumes when the level is unchanged or it was an enemy sandbox', () => {
    expect(planResume({ packId: 'p' }, withLevel(level()), 5, 3)).toEqual({ kind: 'resume' })
    const origin = { packId: 'p', level: { id: 'mine', def: level(), cut: 0 } }
    expect(planResume(origin, withLevel(level()), 12, 3)).toEqual({ kind: 'resume' })
  })

  it('restarts an edited level at the fight on screen, where the player was', () => {
    // Played from x = 8 (cut 5); the player has walked to 9 in the cut level, so x = 14, inside the fight at 10.
    const origin = { packId: 'p', level: { id: 'mine', def: level(), cut: levelCut(8, 3) } }
    const plan = planResume(origin, withLevel(level(3)), 9, 3)
    if (plan.kind !== 'restart') throw new Error('expected a restart')
    expect(plan.origin.level?.cut).toBe(7)
    // The edited fight is replayed (now 3 enemies), with the player standing at it.
    const [first] = placeTriggers(plan.level)
    expect(first.kind === 'wave' && first.waves[0].enemies).toHaveLength(3)
    expect(first.x).toBe(3)
    expect(plan.level).toEqual(levelFrom(level(3), 10, 3))
  })

  it('restarts from the player when no fight is near', () => {
    const origin = { packId: 'p', level: { id: 'mine', def: level(), cut: 0 } }
    const plan = planResume(origin, withLevel(level(2)), 50, 3)
    if (plan.kind !== 'restart') throw new Error('expected a restart')
    expect(plan.origin.level?.cut).toBe(47)
    expect(placeTriggers(plan.level).map((t) => t.kind)).toEqual(['goal'])
  })

  it('freezes the scene while editing, only in a sandbox', () => {
    const s = useGameStore.getState()
    s.startRun(0)
    s.setGameScreen('playing')
    s.editPlaytest()
    expect(useGameStore.getState().editing).toBe(false)
    s.startSandbox(level(), { packId: 'p' })
    s.setGameScreen('playing')
    useGameStore.getState().editPlaytest()
    expect(useGameStore.getState().editing).toBe(true)
    expect(isFrozen(useGameStore.getState())).toBe(true)
    expect(useGameStore.getState().playtest).toEqual({ packId: 'p' })
    useGameStore.getState().resumePlaytest()
    expect(isFrozen(useGameStore.getState())).toBe(false)
    useGameStore.getState().editPlaytest()
    useGameStore.getState().quitRun()
    expect(useGameStore.getState()).toMatchObject({ editing: false, gameScreen: 'forge', sandbox: null, playtest: null })
  })
})
