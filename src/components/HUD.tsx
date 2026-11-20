import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

export const HUD = () => {
  const playerHealth = useGameStore((state) => state.playerHealth)
  const playerMaxHealth = useGameStore((state) => state.playerMaxHealth)
  const score = useGameStore((state) => state.score)
  const enemies = useGameStore((state) => state.enemies)
  const isGameOver = useGameStore((state) => state.isGameOver)
  const level = useGameStore((state) => state.levelProgress)
  const resetGame = useGameStore((state) => state.resetGame)
  const setGameScreen = useGameStore((state) => state.setGameScreen)
  const showHitboxes = useGameStore((state) => state.showHitboxes)

  // H toggles the hitbox debug overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && !e.repeat) useGameStore.getState().toggleHitboxes()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      // The end-of-game panel opts back in; the rest must let drags reach the canvas.
      pointerEvents: 'none',
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

      {/* Level and fight progress */}
      <div style={{ fontSize: '16px', marginBottom: '10px' }}>
        {level.levelName.toUpperCase()}
        {level.waveLabel && ` | ${level.waveLabel.toUpperCase()}`}
        {` | ENEMIES: ${enemies.length}`}
      </div>

      {level.goPrompt && (
        <div
          style={{
            position: 'fixed',
            top: '35%',
            right: '8%',
            fontSize: '56px',
            fontWeight: 'bold',
            color: '#ffdd44',
            textShadow: '0 0 12px #000',
            animation: 'ff-go-blink 0.6s steps(2, start) infinite',
          }}
        >
          GO →
          <style>{'@keyframes ff-go-blink { to { visibility: hidden; } }'}</style>
        </div>
      )}

      {/* Controls */}
      <div style={{ fontSize: '12px', marginTop: '20px', opacity: 0.7 }}>
        A/D - Move | W/S - Depth | SPACE - Jump | J - Attack (tap for combo) | ESC - Pause
        <br />H - Hitboxes{showHitboxes ? ' (ON)' : ''}
      </div>

      {/* Game over / level complete */}
      {(isGameOver || level.complete) && (
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
          <h1
            style={{
              fontSize: '48px',
              color: isGameOver ? '#ff0000' : '#44ff88',
              marginBottom: '20px',
            }}
          >
            {isGameOver ? 'GAME OVER' : 'LEVEL COMPLETE'}
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
              {isGameOver ? 'RESTART' : 'PLAY AGAIN'}
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
