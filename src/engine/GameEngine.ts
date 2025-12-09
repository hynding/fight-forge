import type { GameState, Fighter, FighterState } from '../types';
import { Physics } from './Physics';

export class GameEngine {
  private gameState: GameState;
  private lastTimestamp: number = 0;
  private animationFrameId: number | null = null;

  constructor(initialState: GameState) {
    this.gameState = initialState;
  }

  start(onUpdate: (state: GameState) => void): void {
    const gameLoop = (timestamp: number) => {
      const deltaTime = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      if (!this.gameState.isPaused) {
        this.update(deltaTime / 16.67); // Normalize to 60fps
        onUpdate(this.gameState);
      }

      this.animationFrameId = requestAnimationFrame(gameLoop);
    };

    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(gameLoop);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private update(deltaTime: number): void {
    this.gameState.fighters.forEach((fighter) => {
      this.updateFighter(fighter, deltaTime);
    });

    this.checkCollisions();
    this.checkWinCondition();
  }

  private updateFighter(fighter: Fighter, deltaTime: number): void {
    // Apply gravity
    fighter.velocity = Physics.applyGravity(
      fighter.velocity,
      this.gameState.stage.groundLevel,
      fighter.position.y
    );

    // Update position
    fighter.position = Physics.updateFighterPosition(fighter, deltaTime);

    // Ground collision
    if (fighter.position.y >= this.gameState.stage.groundLevel) {
      fighter.position.y = this.gameState.stage.groundLevel;
      fighter.velocity.y = 0;

      // Return to idle if was jumping
      if (fighter.state === 'JUMPING') {
        fighter.state = 'IDLE';
      }
    }

    // Apply friction when on ground
    if (fighter.position.y === this.gameState.stage.groundLevel) {
      fighter.velocity = Physics.applyFriction(fighter.velocity);
    }

    // Clamp position to stage bounds
    fighter.position = Physics.clampPosition(
      fighter.position,
      this.gameState.stage,
      fighter.hitbox.width
    );

    // Auto-return from certain states
    if (fighter.state === 'HIT' && Math.abs(fighter.velocity.x) < 0.1) {
      fighter.state = 'IDLE';
    }
  }

  private checkCollisions(): void {
    if (this.gameState.fighters.length < 2) return;

    const [fighter1, fighter2] = this.gameState.fighters;

    // Check hit collisions
    if (fighter1.state === 'ATTACKING' && fighter2.state !== 'BLOCKING') {
      if (Physics.checkHitCollision(fighter1, fighter2)) {
        this.applyDamage(fighter1, fighter2);
      }
    }

    if (fighter2.state === 'ATTACKING' && fighter1.state !== 'BLOCKING') {
      if (Physics.checkHitCollision(fighter2, fighter1)) {
        this.applyDamage(fighter2, fighter1);
      }
    }
  }

  private applyDamage(attacker: Fighter, defender: Fighter): void {
    defender.stats.health = Math.max(0, defender.stats.health - attacker.stats.attackPower);
    defender.state = 'HIT';
    
    // Knockback
    const knockbackForce = 5;
    defender.velocity.x = attacker.direction * knockbackForce;
    
    if (defender.stats.health <= 0) {
      defender.state = 'DEFEATED';
    }
  }

  private checkWinCondition(): void {
    const defeatedFighters = this.gameState.fighters.filter(
      (f) => f.state === 'DEFEATED'
    );

    if (defeatedFighters.length > 0) {
      const winner = this.gameState.fighters.find((f) => f.state !== 'DEFEATED');
      if (winner) {
        this.gameState.winner = winner.id;
        this.gameState.isPaused = true;
      }
    }
  }

  getState(): GameState {
    return this.gameState;
  }

  updateFighterState(fighterId: string, state: FighterState): void {
    const fighter = this.gameState.fighters.find((f) => f.id === fighterId);
    if (fighter) {
      fighter.state = state;
    }
  }

  moveFighter(fighterId: string, direction: number): void {
    const fighter = this.gameState.fighters.find((f) => f.id === fighterId);
    if (fighter && fighter.state !== 'DEFEATED') {
      fighter.velocity.x = direction * fighter.stats.speed;
      fighter.state = direction !== 0 ? 'WALKING' : 'IDLE';
      if (direction !== 0) {
        fighter.direction = direction > 0 ? 1 : -1;
      }
    }
  }

  jumpFighter(fighterId: string): void {
    const fighter = this.gameState.fighters.find((f) => f.id === fighterId);
    if (fighter && fighter.position.y === this.gameState.stage.groundLevel && fighter.state !== 'DEFEATED') {
      fighter.velocity.y = -fighter.stats.jumpForce;
      fighter.state = 'JUMPING';
    }
  }

  attackFighter(fighterId: string): void {
    const fighter = this.gameState.fighters.find((f) => f.id === fighterId);
    if (fighter && fighter.state === 'IDLE' || fighter?.state === 'WALKING') {
      fighter.state = 'ATTACKING';
      
      // Reset attack state after a delay
      setTimeout(() => {
        if (fighter.state === 'ATTACKING') {
          fighter.state = 'IDLE';
        }
      }, 300);
    }
  }

  blockFighter(fighterId: string, blocking: boolean): void {
    const fighter = this.gameState.fighters.find((f) => f.id === fighterId);
    if (fighter && fighter.state !== 'DEFEATED') {
      if (blocking && (fighter.state === 'IDLE' || fighter.state === 'WALKING')) {
        fighter.state = 'BLOCKING';
      } else if (!blocking && fighter.state === 'BLOCKING') {
        fighter.state = 'IDLE';
      }
    }
  }
}
