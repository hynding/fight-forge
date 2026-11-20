import { describe, expect, it } from 'vitest'
import { resolveClip, resolveFighterClip, type ClipMap } from './animation'

const ROBOT = new Set(['Idle', 'Walking', 'Jump', 'Punch', 'Death'])
const clips: ClipMap = {
  idle: 'Idle',
  walk: 'Walking',
  jump: 'Jump',
  attack: { name: 'Punch', speed: 3 },
  dead: 'Death',
}

describe('resolveClip', () => {
  it('maps a state to its clip', () => {
    expect(resolveClip('walk', clips, ROBOT)).toEqual({ name: 'Walking', speed: 1, loop: true })
  })

  it('carries a speed and plays action states once', () => {
    expect(resolveClip('attack', clips, ROBOT)).toEqual({ name: 'Punch', speed: 3, loop: false })
    expect(resolveClip('dead', clips, ROBOT)?.loop).toBe(false)
  })

  it('falls back through the chain for unmapped states', () => {
    // knockdown -> hitstun -> idle
    expect(resolveClip('knockdown', clips, ROBOT)).toEqual({ name: 'Idle', speed: 1, loop: true })
    // dodge -> walk
    expect(resolveClip('dodge', clips, ROBOT)?.name).toBe('Walking')
  })

  it('skips clips the model does not have', () => {
    const noWalk = new Set(['Idle'])
    expect(resolveClip('walk', clips, noWalk)?.name).toBe('Idle')
  })

  it('returns null when nothing matches', () => {
    expect(resolveClip('walk', {}, ROBOT)).toBeNull()
    expect(resolveClip('dead', { idle: 'Idle' }, ROBOT)).toBeNull()
  })
})

describe('resolveFighterClip', () => {
  it("plays an attack's own move clip once", () => {
    expect(resolveFighterClip('attack', { name: 'Death', speed: 2 }, clips, ROBOT)).toEqual({
      name: 'Death',
      speed: 2,
      loop: false,
    })
  })

  it('falls back to the state clip when the move clip is missing or not an attack', () => {
    expect(resolveFighterClip('attack', 'Kick', clips, ROBOT)?.name).toBe('Punch')
    expect(resolveFighterClip('attack', undefined, clips, ROBOT)?.name).toBe('Punch')
    expect(resolveFighterClip('walk', 'Death', clips, ROBOT)?.name).toBe('Walking')
  })
})
