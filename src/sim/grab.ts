// Grabs and throws: the player walks into (or presses grab beside) a free or
// stunned enemy and holds it; held, the enemy is a `held` reaction that the
// grab system pins in front of the grabber. Moveset rows `when: "grabbing"`
// decide what attack presses do (knees, throws). A throw move launches the held
// enemy, knocked down, and it knocks down other enemies it flies into.
// Pure TS; GrabSystem applies it to bodies.

import type { FighterRuntime, Vec2 } from './fighter'
import { interruptMove } from './moves'

export interface GrabConfig {
  /** Gap between hurtboxes (X) within which a grab connects. */
  range: number
  /** Max depth difference for a grab. */
  depthTolerance: number
  /** Seconds of walking into an enemy before a contact grab. */
  contactTime: number
  /** Seconds before a held enemy breaks free. */
  holdTime: number
  /** Seconds after a grab ends before the next. */
  cooldown: number
  /** Speed both fighters are pushed apart when the enemy breaks free. */
  releasePush: number
}

/** A move that throws the held enemy as its active frames begin. */
export interface ThrowDef {
  /** `forward` is the way the thrower faces; `back` throws over the shoulder. */
  direction: 'forward' | 'back'
  /** Horizontal launch speed. */
  speed: number
  /** Upward launch speed. */
  lift: number
  /** Damage to the thrown enemy. */
  damage: number
  /** Damage to each enemy the thrown one hits. */
  hitDamage: number
}

export interface GrabState {
  /** The held fighter's name. */
  target: string | null
  /** Seconds spent walking into a grabbable enemy. */
  contact: number
  cooldownLeft: number
  /** The move instance that already threw, so a throw fires once. */
  thrownInstance: number
}

export const createGrabState = (): GrabState => ({ target: null, contact: 0, cooldownLeft: 0, thrownInstance: -1 })

/** A thrown fighter in flight: it knocks down the others it touches, once each. */
export interface ThrownState {
  by: string
  damage: number
  dirX: number
  hit: Set<string>
}

/** Free or reeling from a hit: grabbable (not down, held, flying, dodging or mid-attack's active armor). */
export const canBeGrabbed = (rt: FighterRuntime): boolean =>
  (rt.reaction.kind === null || rt.reaction.kind === 'hitstun') && rt.reaction.invulnerableLeft <= 0 && rt.thrown === null && rt.dodge.timeLeft <= 0

/** Whether a fighter at `self` facing its way can reach a target at `target`. */
export const inGrabRange = (self: Vec2, selfRt: FighterRuntime, target: Vec2, targetRt: FighterRuntime, cfg: GrabConfig): boolean => {
  const dx = target.x - self.x
  if (Math.sign(dx) !== Math.sign(selfRt.facing.x)) return false
  const gap = Math.abs(dx) - (selfRt.hurtbox.x + targetRt.hurtbox.x)
  return gap <= cfg.range && Math.abs(target.z - self.z) <= cfg.depthTolerance
}

/** Walking into a grabbable enemy builds contact; returns true when it's long enough to grab. */
export const stepContact = (s: GrabState, pushing: boolean, dt: number, cfg: GrabConfig): boolean => {
  s.contact = pushing ? s.contact + dt : 0
  return s.contact >= cfg.contactTime - 1e-9
}

/** Starts holding `target` (named `targetName`). */
export const startGrab = (grabber: FighterRuntime, target: FighterRuntime, targetName: string, cfg: GrabConfig): void => {
  interruptMove(target.move)
  target.reaction.kind = 'held'
  target.reaction.timeLeft = cfg.holdTime
  target.velocity = { x: 0, z: 0 }
  target.facing.x = -grabber.facing.x
  grabber.grab.target = targetName
  grabber.grab.contact = 0
  grabber.velocity = { x: 0, z: 0 }
}

/** Ends the grab on the grabber's side. */
export const endGrab = (grabber: FighterRuntime, cfg: GrabConfig): void => {
  grabber.grab.target = null
  grabber.grab.contact = 0
  grabber.grab.cooldownLeft = cfg.cooldown
}

/** Where the held fighter stands: just in front of the grabber, hurtboxes touching. */
export const holdPosition = (grabberPos: Vec2, grabber: FighterRuntime, target: FighterRuntime, side = 1): Vec2 => ({
  x: grabberPos.x + side * grabber.facing.x * (grabber.hurtbox.x + target.hurtbox.x + 0.05),
  z: grabberPos.z,
})

/** The launch: horizontal direction (±1) and velocity for a throw by a grabber facing `facingX`. */
export const throwLaunch = (t: ThrowDef, facingX: number): { dirX: number; x: number; y: number } => {
  const dirX = (t.direction === 'back' ? -1 : 1) * (Math.sign(facingX) || 1)
  return { dirX, x: dirX * t.speed, y: t.lift }
}

/** A throw flight lasts while the fighter is down and still moving fast enough. */
export const stillFlying = (rt: FighterRuntime, minSpeed = 1): boolean =>
  rt.reaction.kind === 'knockdown' && Math.abs(rt.velocity.x) >= minSpeed
