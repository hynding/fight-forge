import type { Vector2D, CollisionBox, Fighter } from '../types';

export class Physics {
  private static readonly GRAVITY = 0.5;
  private static readonly FRICTION = 0.8;

  static applyGravity(velocity: Vector2D, groundLevel: number, positionY: number): Vector2D {
    if (positionY < groundLevel) {
      return {
        x: velocity.x,
        y: velocity.y + this.GRAVITY,
      };
    }
    return velocity;
  }

  static applyFriction(velocity: Vector2D): Vector2D {
    return {
      x: velocity.x * this.FRICTION,
      y: velocity.y,
    };
  }

  static checkCollision(box1: CollisionBox, box2: CollisionBox): boolean {
    return (
      box1.x < box2.x + box2.width &&
      box1.x + box1.width > box2.x &&
      box1.y < box2.y + box2.height &&
      box1.y + box1.height > box2.y
    );
  }

  static clampPosition(
    position: Vector2D,
    bounds: { width: number; height: number; groundLevel: number },
    fighterWidth: number
  ): Vector2D {
    return {
      x: Math.max(0, Math.min(position.x, bounds.width - fighterWidth)),
      y: Math.max(0, Math.min(position.y, bounds.groundLevel)),
    };
  }

  static updateFighterPosition(fighter: Fighter, deltaTime: number): Vector2D {
    const newPosition = {
      x: fighter.position.x + fighter.velocity.x * deltaTime,
      y: fighter.position.y + fighter.velocity.y * deltaTime,
    };
    return newPosition;
  }

  static checkHitCollision(attacker: Fighter, defender: Fighter): boolean {
    const attackerHitbox = {
      x: attacker.position.x + attacker.hitbox.x,
      y: attacker.position.y + attacker.hitbox.y,
      width: attacker.hitbox.width,
      height: attacker.hitbox.height,
    };

    const defenderHurtbox = {
      x: defender.position.x + defender.hurtbox.x,
      y: defender.position.y + defender.hurtbox.y,
      width: defender.hurtbox.width,
      height: defender.hurtbox.height,
    };

    return this.checkCollision(attackerHitbox, defenderHurtbox);
  }
}
