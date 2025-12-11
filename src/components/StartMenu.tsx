import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

export const StartMenu = () => {
  const setGameScreen = useGameStore((state) => state.setGameScreen)
  const [isHovered, setIsHovered] = useState(false)

  const handleStartGame = () => {
    setGameScreen('loading')

    // Simulate loading and then start the game
    setTimeout(() => {
      setGameScreen('playing')
    }, 2000)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      {/* Title */}
      <div style={{
        marginBottom: '60px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '72px',
          fontWeight: 'bold',
          margin: 0,
          textShadow: '0 0 20px rgba(255, 68, 68, 0.5), 0 0 40px rgba(68, 68, 255, 0.3)',
          letterSpacing: '8px',
        }}>
          FIGHT FORGE
        </h1>
        <p style={{
          fontSize: '20px',
          marginTop: '20px',
          color: '#aaaaaa',
          letterSpacing: '4px',
        }}>
          A BRAWLER EXPERIENCE
        </p>
      </div>

      {/* Play Button */}
      <button
        onClick={handleStartGame}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: '20px 60px',
          fontSize: '24px',
          fontWeight: 'bold',
          backgroundColor: isHovered ? '#ff4444' : 'transparent',
          color: isHovered ? 'white' : '#ff4444',
          border: '3px solid #ff4444',
          borderRadius: '8px',
          cursor: 'pointer',
          letterSpacing: '4px',
          transition: 'all 0.3s ease',
          boxShadow: isHovered ? '0 0 30px rgba(255, 68, 68, 0.6)' : 'none',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        START GAME
      </button>

      {/* Controls Info */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        textAlign: 'center',
        fontSize: '14px',
        color: '#888888',
      }}>
        <div style={{ marginBottom: '10px' }}>
          <strong>CONTROLS:</strong>
        </div>
        <div>WASD - Move | SPACE - Jump | J - Attack | K - Block</div>
      </div>

      {/* Visual Effects */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        border: '2px solid rgba(255, 68, 68, 0.2)',
        borderRadius: '50%',
        pointerEvents: 'none',
        animation: 'pulse 3s infinite',
      }} />

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.3;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 0.1;
            }
          }
        `}
      </style>
    </div>
  )
}
