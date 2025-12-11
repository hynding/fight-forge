import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

export const PauseMenu = () => {
  const isPaused = useGameStore((state) => state.isPaused)
  const togglePause = useGameStore((state) => state.togglePause)
  const setGameScreen = useGameStore((state) => state.setGameScreen)
  const resetGame = useGameStore((state) => state.resetGame)

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        togglePause()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [togglePause])

  const handleReturnToMenu = () => {
    togglePause()
    setGameScreen('menu')
    resetGame()
  }

  const handleResume = () => {
    togglePause()
  }

  if (!isPaused) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'monospace',
      userSelect: 'none',
      zIndex: 1000,
    }}>
      <h1 style={{
        fontSize: '48px',
        marginBottom: '40px',
        letterSpacing: '4px',
      }}>
        PAUSED
      </h1>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <button
          onClick={handleResume}
          style={{
            padding: '15px 60px',
            fontSize: '18px',
            backgroundColor: '#4444ff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            letterSpacing: '2px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#6666ff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4444ff'
          }}
        >
          RESUME
        </button>

        <button
          onClick={handleReturnToMenu}
          style={{
            padding: '15px 60px',
            fontSize: '18px',
            backgroundColor: 'transparent',
            color: '#888888',
            border: '2px solid #888888',
            borderRadius: '5px',
            cursor: 'pointer',
            letterSpacing: '2px',
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

      <div style={{
        position: 'absolute',
        bottom: '40px',
        fontSize: '14px',
        color: '#666666',
      }}>
        Press ESC to resume
      </div>
    </div>
  )
}
