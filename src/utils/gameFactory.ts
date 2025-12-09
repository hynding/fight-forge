import type { Fighter, FighterStats, Direction } from '../types';

export function createFighter(
  id: string,
  startX: number,
  startY: number,
  direction: Direction = 1
): Fighter {
  const defaultStats: FighterStats = {
    maxHealth: 100,
    health: 100,
    attackPower: 10,
    speed: 3,
    jumpForce: 12,
  };

  return {
    id,
    position: { x: startX, y: startY },
    velocity: { x: 0, y: 0 },
    state: 'IDLE',
    direction,
    stats: defaultStats,
    hitbox: {
      x: 0,
      y: 0,
      width: 60,
      height: 80,
    },
    hurtbox: {
      x: 5,
      y: 5,
      width: 50,
      height: 70,
    },
    attackTimer: 0,
  };
}

export function createDefaultGameState() {
  return {
    fighters: [
      createFighter('player1', 100, 300, 1),
      createFighter('player2', 600, 300, -1),
    ],
    stage: {
      width: 800,
      height: 400,
      groundLevel: 300,
    },
    isPaused: false,
    winner: null,
  };
}
