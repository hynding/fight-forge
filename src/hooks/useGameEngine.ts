import { useState, useEffect, useRef } from 'react';
import type { GameState, InputState } from '../types';
import { GameEngine } from '../engine/GameEngine';
import { createDefaultGameState } from '../utils/gameFactory';

export function useGameEngine() {
  const [gameState, setGameState] = useState<GameState>(createDefaultGameState());
  const engineRef = useRef<GameEngine | null>(null);
  const inputStateRef = useRef<Map<string, InputState>>(new Map());

  useEffect(() => {
    // Initialize game engine
    const initialState = createDefaultGameState();
    engineRef.current = new GameEngine(initialState);
    
    engineRef.current.start((newState) => {
      setGameState({ ...newState });
    });

    return () => {
      engineRef.current?.stop();
    };
  }, []);

  const handleInput = (playerId: string, input: Partial<InputState>) => {
    if (!engineRef.current) return;

    const currentInput = inputStateRef.current.get(playerId) || {
      left: false,
      right: false,
      up: false,
      down: false,
      attack: false,
      block: false,
    };

    const newInput = { ...currentInput, ...input };
    inputStateRef.current.set(playerId, newInput);

    const engine = engineRef.current;

    // Handle movement
    if (newInput.left && !newInput.right) {
      engine.moveFighter(playerId, -1);
    } else if (newInput.right && !newInput.left) {
      engine.moveFighter(playerId, 1);
    } else {
      engine.moveFighter(playerId, 0);
    }

    // Handle jump
    if (newInput.up) {
      engine.jumpFighter(playerId);
    }

    // Handle attack
    if (newInput.attack) {
      engine.attackFighter(playerId);
    }

    // Handle block
    engine.blockFighter(playerId, newInput.block);
  };

  const resetGame = () => {
    engineRef.current?.stop();
    const newState = createDefaultGameState();
    setGameState(newState);
    engineRef.current = new GameEngine(newState);
    engineRef.current.start((newState) => {
      setGameState({ ...newState });
    });
    inputStateRef.current.clear();
  };

  return {
    gameState,
    handleInput,
    resetGame,
  };
}
