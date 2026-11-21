// Props: stage objects placed by levels from the content's prop library:
// crates, barrels, walls, platforms. Solid props collide (fighters can stand
// on them); breakable ones take hits from the player's attacks and may drop
// a pickup. Pure TS: placement and hit boxes.

import type { DropDef } from './pickups'
import type { Box } from './combat'

export interface PropDef {
  shape: 'box' | 'cylinder'
  /** Full size [x, y, z]; a cylinder uses x as its diameter and y as its height. */
  size: [number, number, number]
  color: string
  /** Has a collider: fighters bump into it and can stand on it. */
  solid: boolean
  /** Can be broken by the player's attacks. */
  breakable?: { health: number; drop?: DropDef }
  /** Weapon id: grab beside it to lift it (it becomes that weapon). */
  liftable?: string
}

/** A prop as placed in a level segment. */
export interface PropPlacement {
  /** Prop id in the content's `props`. */
  prop: string
  /** X offset inside the segment. */
  at: number
  /** Position across the depth lane: 0 = back, 1 = front (default middle). */
  depth?: number
  /** Height of its base above the floor (default 0, standing on it). */
  y?: number
}

/** A prop on the stage. */
export interface PropInstance {
  id: string
  prop: string
  x: number
  /** Base height above the floor. */
  y: number
  z: number
  /** Hits left for a breakable prop; Infinity otherwise. */
  health: number
}

/** The box a prop occupies, with `floorTop` the height of the floor surface. */
export const propBox = (p: Pick<PropInstance, 'x' | 'y' | 'z'>, def: PropDef, floorTop: number): Box => ({
  center: { x: p.x, y: floorTop + p.y + def.size[1] / 2, z: p.z },
  half: { x: def.size[0] / 2, y: def.size[1] / 2, z: (def.shape === 'cylinder' ? def.size[0] : def.size[2]) / 2 },
})
