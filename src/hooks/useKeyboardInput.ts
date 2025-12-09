import { useEffect } from 'react';
import type { InputState } from '../types';

interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  attack: string;
  block: string;
}

export function useKeyboardInput(
  playerId: string,
  keyBindings: KeyBindings,
  onInputChange: (playerId: string, input: Partial<InputState>) => void
) {
  useEffect(() => {
    const pressedKeys = new Set<string>();

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      
      if (pressedKeys.has(key)) return;
      pressedKeys.add(key);

      const input: Partial<InputState> = {};

      if (key === keyBindings.left.toLowerCase()) {
        input.left = true;
      }
      if (key === keyBindings.right.toLowerCase()) {
        input.right = true;
      }
      if (key === keyBindings.up.toLowerCase()) {
        input.up = true;
      }
      if (key === keyBindings.down.toLowerCase()) {
        input.down = true;
      }
      if (key === keyBindings.attack.toLowerCase()) {
        input.attack = true;
      }
      if (key === keyBindings.block.toLowerCase()) {
        input.block = true;
      }

      if (Object.keys(input).length > 0) {
        onInputChange(playerId, input);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeys.delete(key);

      const input: Partial<InputState> = {};

      if (key === keyBindings.left.toLowerCase()) {
        input.left = false;
      }
      if (key === keyBindings.right.toLowerCase()) {
        input.right = false;
      }
      if (key === keyBindings.up.toLowerCase()) {
        input.up = false;
      }
      if (key === keyBindings.down.toLowerCase()) {
        input.down = false;
      }
      if (key === keyBindings.attack.toLowerCase()) {
        input.attack = false;
      }
      if (key === keyBindings.block.toLowerCase()) {
        input.block = false;
      }

      if (Object.keys(input).length > 0) {
        onInputChange(playerId, input);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playerId, keyBindings, onInputChange]);
}
