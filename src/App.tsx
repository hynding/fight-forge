import { useGameEngine } from './hooks/useGameEngine';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { Stage } from './components/Stage';
import { Controls } from './components/Controls';
import './App.css';

function App() {
  const { gameState, handleInput, resetGame } = useGameEngine();

  // Player 1 controls (WASD + Space + Shift)
  useKeyboardInput(
    'player1',
    {
      left: 'a',
      right: 'd',
      up: 'w',
      down: 's',
      attack: ' ',
      block: 'Shift',
    },
    handleInput
  );

  // Player 2 controls (Arrow keys + Enter + RShift)
  useKeyboardInput(
    'player2',
    {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      attack: 'Enter',
      block: 'ShiftRight',
    },
    handleInput
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fight Forge</h1>
        <p>A Web-Based Brawler Engine</p>
      </header>

      <main className="app-main">
        <Stage gameState={gameState} />
        
        <div className="app-actions">
          <button className="reset-button" onClick={resetGame}>
            Reset Game
          </button>
        </div>

        <Controls />
      </main>

      <footer className="app-footer">
        <p>Built with React & TypeScript</p>
      </footer>
    </div>
  );
}

export default App;
