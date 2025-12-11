import { useGameStore } from '../store/gameStore'

export const HUD = () => {
  const playerHealth = useGameStore((state) => state.playerHealth)
  const playerMaxHealth = useGameStore((state) => state.playerMaxHealth)
  const score = useGameStore((state) => state.score)
  const enemies = useGameStore((state) => state.enemies)
  const isGameOver = useGameStore((state) => state.isGameOver)
  const resetGame = useGameStore((state) => state.resetGame)
  const setGameScreen = useGameStore((state) => state.setGameScreen)

  const handleReturnToMenu = () => {
    setGameScreen('menu')
    // Reset game state when returning to menu
    resetGame()
  }

  const healthPercentage = (playerHealth / playerMaxHealth) * 100

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      padding: '20px',
      pointerEvents: isGameOver ? 'auto' : 'none',
      color: 'white',
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      {/* Health Bar */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '14px', marginBottom: '5px' }}>
          HEALTH: {playerHealth}/{playerMaxHealth}
        </div>
        <div style={{
          width: '300px',
          height: '30px',
          backgroundColor: '#333',
          border: '2px solid #666',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${healthPercentage}%`,
            height: '100%',
            backgroundColor: healthPercentage > 50 ? '#00ff00' : healthPercentage > 25 ? '#ffff00' : '#ff0000',
            transition: 'width 0.3s, background-color 0.3s',
          }} />
        </div>
      </div>

      {/* Score */}
      <div style={{ fontSize: '20px', marginBottom: '10px' }}>
        SCORE: {score}
      </div>

      {/* Enemy Count */}
      <div style={{ fontSize: '16px', marginBottom: '10px' }}>
        ENEMIES: {enemies.length}
      </div>

      {/* Controls */}
      <div style={{ fontSize: '12px', marginTop: '20px', opacity: 0.7 }}>
        WASD - Move | SPACE - Jump | J - Attack | K - Block
      </div>

      {/* Game Over Screen */}
      {isGameOver && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '40px',
          borderRadius: '10px',
          textAlign: 'center',
          pointerEvents: 'auto',
        }}>
          <h1 style={{ fontSize: '48px', color: '#ff0000', marginBottom: '20px' }}>
            GAME OVER
          </h1>
          <div style={{ fontSize: '24px', marginBottom: '30px' }}>
            Final Score: {score}
          </div>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button
              onClick={resetGame}
              style={{
                padding: '15px 30px',
                fontSize: '18px',
                backgroundColor: '#4444ff',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6666ff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#4444ff'
              }}
            >
              RESTART
            </button>
            <button
              onClick={handleReturnToMenu}
              style={{
                padding: '15px 30px',
                fontSize: '18px',
                backgroundColor: 'transparent',
                color: '#888888',
                border: '2px solid #888888',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#333333'
                e.currentTarget.style.color = 'white'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#888888'
              }}
            >
              MAIN MENU
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
