export interface Vector2D {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CollisionBox = Bounds;

export type FighterState =
  | 'IDLE'
  | 'WALKING'
  | 'JUMPING'
  | 'ATTACKING'
  | 'HIT'
  | 'BLOCKING'
  | 'DEFEATED';

export type Direction = -1 | 1;

export interface FighterStats {
  maxHealth: number;
  health: number;
  attackPower: number;
  speed: number;
  jumpForce: number;
}

export interface Fighter {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  state: FighterState;
  direction: Direction;
  stats: FighterStats;
  hitbox: CollisionBox;
  hurtbox: CollisionBox;
}

export interface GameState {
  fighters: Fighter[];
  stage: {
    width: number;
    height: number;
    groundLevel: number;
  };
  isPaused: boolean;
  winner: string | null;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean;
  block: boolean;
}
