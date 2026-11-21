import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { createFighterRuntime, isBusy, nextFighterState } from './fighter'
import { canBeGrabbed, endGrab, holdPosition, inGrabRange, startGrab, stepContact, stillFlying, throwLaunch } from './grab'
import { applyHit } from './reactions'
import { startMove } from './moves'
import { matchTrigger, type Moveset } from './moveset'

const cfg = DEFAULT_CONFIG.actions.grab
const fighter = () => {
  const rt = createFighterRuntime()
  rt.hurtbox = { x: 0.3, y: 1, z: 0.3 }
  return rt
}

describe('grabbing', () => {
  it('reaches an enemy just in front, at about the same depth, not behind', () => {
    const me = fighter()
    const them = fighter()
    expect(inGrabRange({ x: 0, z: 0 }, me, { x: 0.7, z: 0.2 }, them, cfg)).toBe(true)
    expect(inGrabRange({ x: 0, z: 0 }, me, { x: 1.5, z: 0 }, them, cfg)).toBe(false)
    expect(inGrabRange({ x: 0, z: 0 }, me, { x: 0.7, z: 1 }, them, cfg)).toBe(false)
    expect(inGrabRange({ x: 0, z: 0 }, me, { x: -0.7, z: 0 }, them, cfg)).toBe(false)
  })

  it('grabs free or stunned fighters only', () => {
    const rt = fighter()
    expect(canBeGrabbed(rt)).toBe(true)
    rt.reaction.kind = 'hitstun'
    expect(canBeGrabbed(rt)).toBe(true)
    rt.reaction.kind = 'knockdown'
    expect(canBeGrabbed(rt)).toBe(false)
    rt.reaction.kind = null
    rt.dodge.timeLeft = 0.1
    expect(canBeGrabbed(rt)).toBe(false)
  })

  it('needs walking into the enemy for the contact time', () => {
    const me = fighter()
    const steps = Math.round(cfg.contactTime * 60)
    for (let i = 1; i < steps; i++) expect(stepContact(me.grab, true, 1 / 60, cfg)).toBe(false)
    expect(stepContact(me.grab, true, 1 / 60, cfg)).toBe(true)
    stepContact(me.grab, false, 1 / 60, cfg)
    expect(me.grab.contact).toBe(0)
  })

  it('holds the target: it is held (busy), the grabber is busy, and both show it', () => {
    const me = fighter()
    const them = fighter()
    startMove(them.move, 'enemyPunch')
    startGrab(me, them, 'e1', cfg)
    expect(me.grab.target).toBe('e1')
    expect(them.reaction).toMatchObject({ kind: 'held', timeLeft: cfg.holdTime })
    expect(them.move.move).toBeNull()
    expect(them.facing.x).toBe(-1)
    expect(isBusy(me)).toBe(true)
    expect(nextFighterState({ dead: false, attacking: false, grabbing: true, grounded: true, moving: false })).toBe('grab')
    expect(nextFighterState({ dead: false, reaction: 'held', attacking: false, grounded: true, moving: false })).toBe('held')
    expect(holdPosition({ x: 1, z: 0.5 }, me, them)).toEqual({ x: 1.65, z: 0.5 })
    expect(holdPosition({ x: 1, z: 0.5 }, me, them, -1).x).toBeCloseTo(0.35)
    endGrab(me, cfg)
    expect(me.grab).toMatchObject({ target: null, cooldownLeft: cfg.cooldown })
  })

  it('keeps a held target held through light hits; a knockdown ends it', () => {
    const r = fighter().reaction
    r.kind = 'held'
    r.timeLeft = 2
    applyHit(r, { hitstun: 0.3, knockback: { x: 0, y: 0 } }, DEFAULT_CONFIG.reactions)
    expect(r).toMatchObject({ kind: 'held', timeLeft: 2 })
    applyHit(r, { hitstun: 0, knockback: { x: 0, y: 0 }, knockdown: true }, DEFAULT_CONFIG.reactions)
    expect(r.kind).toBe('knockdown')
  })

  it('throws forward or over the shoulder', () => {
    const t = { direction: 'forward' as const, speed: 8, lift: 5, damage: 14, hitDamage: 10 }
    expect(throwLaunch(t, -1)).toEqual({ dirX: -1, x: -8, y: 5 })
    expect(throwLaunch({ ...t, direction: 'back' }, -1)).toEqual({ dirX: 1, x: 8, y: 5 })
    const rt = fighter()
    rt.reaction.kind = 'knockdown'
    rt.velocity = { x: 5, z: 0 }
    expect(stillFlying(rt)).toBe(true)
    rt.velocity = { x: 0.5, z: 0 }
    expect(stillFlying(rt)).toBe(false)
  })

  it('matches only grabbing rows while holding, and never them otherwise', () => {
    const moveset: Moveset = [
      { action: 'attack', when: 'grabbing', direction: 'away', move: 'throwBack' },
      { action: 'attack', when: 'grabbing', move: 'grabKnee' },
      { action: 'attack', move: 'jab' },
    ]
    const ctx = { air: false, running: false, blocking: false, direction: null, canPay: () => true }
    expect(matchTrigger(moveset, 'attack', ctx)).toBe(2)
    expect(matchTrigger(moveset, 'attack', { ...ctx, grabbing: true })).toBe(1)
    expect(matchTrigger(moveset, 'attack', { ...ctx, grabbing: true, direction: 'away' })).toBe(0)
    expect(matchTrigger(moveset, 'heavy', { ...ctx, grabbing: true })).toBe(-1)
  })

  it('ships in the default pack: knees chain into a throw, heavies can\'t be grabbed', () => {
    const moves = DEFAULT_CONFIG.moves
    expect(moves.grabKnee.next).toBe('grabKnee2')
    expect(moves.grabKnee2.next).toBe('throwForward')
    expect(moves.throwForward.throw?.direction).toBe('forward')
    expect(moves.throwBack.throw?.direction).toBe('back')
    expect(DEFAULT_CONFIG.enemyTypes.HEAVY.grabbable).toBe(false)
  })
})
