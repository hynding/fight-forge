import type { Fighter as FighterType } from '../types';
import './Fighter.css';

interface FighterProps {
  fighter: FighterType;
}

export function Fighter({ fighter }: FighterProps) {
  const { position, hitbox, state, direction, stats } = fighter;

  const getStateColor = () => {
    switch (state) {
      case 'ATTACKING':
        return '#ff4444';
      case 'HIT':
        return '#ffaa00';
      case 'BLOCKING':
        return '#4444ff';
      case 'DEFEATED':
        return '#666666';
      default:
        return '#44ff44';
    }
  };

  const transform = `translate(${position.x}px, ${position.y}px) scaleX(${direction})`;

  return (
    <div
      className="fighter"
      style={{
        transform,
        width: `${hitbox.width}px`,
        height: `${hitbox.height}px`,
      }}
    >
      <div
        className="fighter-body"
        style={{
          backgroundColor: getStateColor(),
          width: '100%',
          height: '100%',
        }}
      />
      <div className="fighter-health-bar">
        <div
          className="fighter-health-bar-fill"
          style={{
            width: `${(stats.health / stats.maxHealth) * 100}%`,
          }}
        />
      </div>
      <div className="fighter-state">{state}</div>
    </div>
  );
}
