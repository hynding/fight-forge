import './Controls.css';

export function Controls() {
  return (
    <div className="controls">
      <div className="controls-section">
        <h3>Player 1 Controls</h3>
        <ul>
          <li><kbd>A</kbd> / <kbd>D</kbd> - Move Left/Right</li>
          <li><kbd>W</kbd> - Jump</li>
          <li><kbd>Space</kbd> - Attack</li>
          <li><kbd>Shift</kbd> - Block</li>
        </ul>
      </div>
      <div className="controls-section">
        <h3>Player 2 Controls</h3>
        <ul>
          <li><kbd>←</kbd> / <kbd>→</kbd> - Move Left/Right</li>
          <li><kbd>↑</kbd> - Jump</li>
          <li><kbd>Enter</kbd> - Attack</li>
          <li><kbd>RShift</kbd> - Block</li>
        </ul>
      </div>
    </div>
  );
}
