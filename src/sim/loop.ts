import { gameStep, MAX_FRAME_STEP } from '../utils/gameTime'

/** Simulation rate. Systems always see this exact step. */
export const SIM_HZ = 60
export const SIM_STEP = 1 / SIM_HZ

// Tolerates float drift so a frame of exactly 1/60s runs exactly one step.
const EPSILON = 1e-9

/**
 * Explicit system order inside one fixed step. Lower runs first; systems with
 * the same order run in registration order. Leave gaps so later milestones can
 * slot systems in between.
 */
export const SYSTEM_ORDER = {
  /** Controllers decide intents; fighters move, jump, face, and update their state. */
  fighters: 50,
  /** The scrolling camera follows the player (and so moves the player's screen bounds). */
  camera: 60,
  /** Player swing timers: a swing started this step is visible to combat this step. */
  playerAttack: 100,
  /** Enemy attack-slot hold/recovery timers. */
  enemyAttackSlot: 200,
  /** Hit detection and damage. */
  combat: 300,
  /** Periodic enemy spawning. */
  spawner: 400,
} as const

export type SystemStep = (dt: number) => void

interface SystemEntry {
  name: string
  order: number
  seq: number
  step: SystemStep
}

/**
 * Fixed-step accumulator. Each `advance` adds one frame's clamped game time
 * (see `gameStep`) and runs every registered system once per whole step, in
 * `order`. The caller decides when not to advance (pause, game over); the
 * leftover fraction of a step is kept, so pausing doesn't lose or gain time.
 */
export class SimLoop {
  private systems: SystemEntry[] = []
  private accumulator = 0
  private seq = 0
  /** Fixed steps run so far. */
  tick = 0

  /** Seconds of simulated game time so far. */
  get time(): number {
    return this.tick * SIM_STEP
  }

  /** Registers a system; returns a function that removes it. */
  add(name: string, order: number, step: SystemStep): () => void {
    const entry: SystemEntry = { name, order, seq: this.seq++, step }
    // Always replace the array (never mutate it) so `advance` can iterate a snapshot.
    this.systems = [...this.systems, entry].sort((a, b) => a.order - b.order || a.seq - b.seq)
    return () => {
      this.systems = this.systems.filter((s) => s !== entry)
    }
  }

  /** System names in the order they run. */
  get order(): string[] {
    return this.systems.map((s) => s.name)
  }

  /** Feeds one rendered frame's delta; returns how many fixed steps ran. */
  advance(frameDelta: number): number {
    this.accumulator += gameStep(frameDelta)
    let steps = 0
    while (this.accumulator + EPSILON >= SIM_STEP) {
      this.accumulator = Math.max(0, this.accumulator - SIM_STEP)
      // Snapshot so a system added or removed mid-step takes effect next step.
      const systems = this.systems
      for (const s of systems) s.step(SIM_STEP)
      this.tick++
      steps++
    }
    return steps
  }
}

/** Most steps one frame can run, given `gameStep`'s clamp. */
export const MAX_STEPS_PER_FRAME = Math.ceil(MAX_FRAME_STEP / SIM_STEP - EPSILON)
