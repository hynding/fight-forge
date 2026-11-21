import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { getLevels } from '../content/active'
import { PackPanel } from './PackPanel'
import { apiEnabled } from '../net/api'
import { ControlsPanel } from './ControlsPanel'
import { getBindings } from '../content/bindings'
import { controlsHelp } from '../sim/input'

export const StartMenu = () => {
  const startRun = useGameStore((state) => state.startRun)
  const setGameScreen = useGameStore((state) => state.setGameScreen)
  // Re-render when packs change: the level list comes from the active content.
  useGameStore((state) => state.packs)
  const contentError = useGameStore((state) => state.contentError)
  const [isHovered, setIsHovered] = useState(false)
  // Re-render the controls line after a remap.
  const [, setControlsVersion] = useState(0)

  // startRun goes to the loading screen, which advances to 'playing' when loaded.
  const handleStartGame = () => startRun(0)

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

      <PackPanel />
      <ControlsPanel onChange={() => setControlsVersion((v) => v + 1)} />

      {/* Play Button */}
      <button
        onClick={handleStartGame}
        disabled={contentError !== null}
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

      <button
        onClick={() => setGameScreen('forge')}
        style={{
          marginTop: '18px',
          padding: '8px 24px',
          fontSize: '14px',
          fontFamily: 'monospace',
          letterSpacing: '3px',
          backgroundColor: 'transparent',
          color: '#ffd27a',
          border: '1px solid #ffd27a',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        FORGE: MAKE A PACK
      </button>

      {apiEnabled() && (
        <button
          onClick={() => setGameScreen('gallery')}
          style={{
            marginTop: '10px',
            padding: '8px 24px',
            fontSize: '14px',
            fontFamily: 'monospace',
            letterSpacing: '3px',
            backgroundColor: 'transparent',
            color: '#9fd3ff',
            border: '1px solid #9fd3ff',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          BROWSE PACKS
        </button>
      )}

      {/* Level select */}
      <div style={{ marginTop: '40px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '14px', color: '#888888', letterSpacing: '3px', marginBottom: '12px' }}>
          LEVEL SELECT
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {getLevels().map((level, i) => (
            <button
              key={level.id}
              onClick={() => startRun(i)}
              disabled={contentError !== null}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#dddddd',
                border: '1px solid #555555',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {i + 1}. {level.name.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

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
        <div>{controlsHelp(getBindings().keyboard)}</div>
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
