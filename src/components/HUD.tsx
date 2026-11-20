import { useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../store/gameStore'
import { getLevels } from '../content/active'
import { formatTime } from '../utils/format'

const ResultRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <tr>
    <td style={{ textAlign: 'left', color: '#aaaaaa' }}>{label}</td>
    <td style={{ textAlign: 'right' }}>{value}</td>
  </tr>
)

const MenuButton = ({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean
  onClick: () => void
  children: ReactNode
}) => {
  const [hover, setHover] = useState(false)
  const style = primary
    ? { backgroundColor: hover ? '#6666ff' : '#4444ff', color: 'white', border: 'none' }
    : {
        backgroundColor: hover ? '#333333' : 'transparent',
        color: hover ? 'white' : '#888888',
        border: '2px solid #888888',
      }
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: '15px 30px', fontSize: '18px', borderRadius: '5px', cursor: 'pointer', ...style }}
    >
      {children}
    </button>
  )
}

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
  const lives = useGameStore((state) => state.lives)
  const continuesLeft = useGameStore((state) => state.continuesLeft)
  const kos = useGameStore((state) => state.kos)
  const runKos = useGameStore((state) => state.runKos)
  const levelIndex = useGameStore((state) => state.levelIndex)
  const continueGame = useGameStore((state) => state.continueGame)
  const nextLevel = useGameStore((state) => state.nextLevel)
  const startRun = useGameStore((state) => state.startRun)
  const lastLevel = levelIndex >= getLevels().length - 1

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

      {/* Score and lives */}
      <div style={{ fontSize: '20px', marginBottom: '10px' }}>
        SCORE: {score} | LIVES: {lives}
      </div>

      {/* Level and fight progress */}
      <div style={{ fontSize: '16px', marginBottom: '10px' }}>
        {`LEVEL ${levelIndex + 1}/${getLevels().length}: ${level.levelName.toUpperCase()}`}
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
        A/D - Move (double-tap to run) | W/S - Depth | SPACE - Jump | J - Attack (tap for combo) | K - Block | SHIFT - Dodge | ESC - Pause
        <br />H - Hitboxes{showHitboxes ? ' (ON)' : ''}
      </div>

      {/* Game over / level results */}
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
          minWidth: '360px',
        }}>
          <h1
            style={{
              fontSize: '48px',
              color: isGameOver ? '#ff0000' : '#44ff88',
              margin: '0 0 20px',
            }}
          >
            {isGameOver ? 'GAME OVER' : lastLevel ? 'ALL LEVELS CLEAR!' : 'LEVEL COMPLETE'}
          </h1>
          <table style={{ margin: '0 auto 30px', fontSize: '20px', borderSpacing: '24px 6px' }}>
            <tbody>
              <ResultRow label="SCORE" value={score} />
              {level.complete && level.time !== null && <ResultRow label="TIME" value={formatTime(level.time)} />}
              <ResultRow label="KOs" value={kos} />
              {level.complete && lastLevel && levelIndex > 0 && <ResultRow label="TOTAL KOs" value={runKos} />}
              {level.complete && <ResultRow label="LIVES" value={lives} />}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {isGameOver && continuesLeft > 0 && (
              <MenuButton primary onClick={continueGame}>
                CONTINUE ({continuesLeft})
              </MenuButton>
            )}
            {level.complete && !lastLevel && (
              <MenuButton primary onClick={nextLevel}>
                NEXT LEVEL
              </MenuButton>
            )}
            {level.complete && lastLevel && (
              <MenuButton primary onClick={() => startRun(0)}>
                PLAY AGAIN
              </MenuButton>
            )}
            {isGameOver && (
              <MenuButton primary={continuesLeft === 0} onClick={resetGame}>
                RESTART LEVEL
              </MenuButton>
            )}
            <MenuButton onClick={handleReturnToMenu}>MAIN MENU</MenuButton>
          </div>
        </div>
      )}
    </div>
  )
}
