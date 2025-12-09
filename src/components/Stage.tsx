import type { GameState } from '../types';
import { Fighter } from './Fighter';
import './Stage.css';

interface StageProps {
  gameState: GameState;
}

export function Stage({ gameState }: StageProps) {
  const { stage, fighters, winner } = gameState;

  return (
    <div className="stage-container">
      <div
        className="stage"
        style={{
          width: `${stage.width}px`,
          height: `${stage.height}px`,
        }}
      >
        <div
          className="ground"
          style={{
            top: `${stage.groundLevel}px`,
          }}
        />
        
        {fighters.map((fighter) => (
          <Fighter key={fighter.id} fighter={fighter} />
        ))}

        {winner && (
          <div className="winner-overlay">
            <div className="winner-text">
              {winner.toUpperCase()} WINS!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
