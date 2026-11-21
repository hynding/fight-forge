import { useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../store/gameStore'
import { getConfig, getLevels } from '../content/active'
import { getBindings } from '../content/bindings'
import type { InputManager } from '../input/InputManager'
import { actionLabel, deviceHelp, helpExtras, promptLabel } from '../sim/input'
import { formatTime } from '../utils/format'
import { sceneProbe } from '../sim/probe'
import { FRAME_BUDGET_MS, type PerfSnapshot } from '../sim/perf'
import { BossBar } from './BossBar'

const ResultRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <tr>
    <td style={{ textAlign: 'left', color: '#aaaaaa' }}>{label}</td>
    <td style={{ textAlign: 'right' }}>{value}</td>
  </tr>
)

/** Debug overlay (with the hitboxes): frame times against the 60 fps budget and renderer counts. */
const PerfReadout = () => {
  const [perf, setPerf] = useState<PerfSnapshot | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setPerf(sceneProbe.perf()), 500)
    return () => clearInterval(timer)
  }, [])
  if (!perf) return null
  const over = perf.p95 > FRAME_BUDGET_MS
  return (
    <div data-testid="perf-readout" style={{ color: over ? '#ff8866' : '#88ff88' }}>
      {perf.fps.toFixed(0)} fps · {perf.avg.toFixed(1)} ms avg · p95 {perf.p95.toFixed(1)} ms (budget {FRAME_BUDGET_MS.toFixed(1)}) ·{' '}
      {perf.drawCalls} draw calls · {Math.round(perf.triangles / 1000)}k triangles · {perf.fighters} fighters
    </div>
  )
}

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

export const HUD = ({ input }: { input: InputManager }) => {
  const inputDevice = useGameStore((state) => state.inputDevice)
  const padLabels = useGameStore((state) => state.padLabels)
  const playerHealth = useGameStore((state) => state.playerHealth)
  const playerMaxHealth = useGameStore((state) => state.playerMaxHealth)
  const meter = useGameStore((state) => state.meter)
  const score = useGameStore((state) => state.score)
  const enemies = useGameStore((state) => state.enemies)
  const isGameOver = useGameStore((state) => state.isGameOver)
  const level = useGameStore((state) => state.levelProgress)
  const resetGame = useGameStore((state) => state.resetGame)
  const showHitboxes = useGameStore((state) => state.showHitboxes)
  const lives = useGameStore((state) => state.lives)
  const continuesLeft = useGameStore((state) => state.continuesLeft)
  const kos = useGameStore((state) => state.kos)
  const runKos = useGameStore((state) => state.runKos)
  const levelIndex = useGameStore((state) => state.levelIndex)
  const continueGame = useGameStore((state) => state.continueGame)
  const nextLevel = useGameStore((state) => state.nextLevel)
  const startRun = useGameStore((state) => state.startRun)
  const sandbox = useGameStore((state) => state.sandbox !== null)
  const weapon = useGameStore((state) => state.playerWeapon)
  const weaponDef = weapon ? getConfig().weapons[weapon.id] : undefined
  const lastLevel = sandbox || levelIndex >= getLevels().length - 1

  // The hitbox key (H by default) toggles the debug overlay.
  useEffect(
    () =>
      input.onPress((action) => {
        if (action === 'hitboxes') useGameStore.getState().toggleHitboxes()
      }),
    [input]
  )

  const handleReturnToMenu = () => {
    useGameStore.getState().quitRun()
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
      {sandbox && (
        <button
          onClick={() => useGameStore.getState().editPlaytest()}
          title="Open the Forge over this fight; come back to it with your changes"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            pointerEvents: 'auto',
            padding: '6px 12px',
            fontFamily: 'monospace',
            fontSize: '14px',
            background: 'rgba(0, 0, 0, 0.5)',
            color: '#ffd27a',
            border: '1px solid #ffd27a',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ✎ EDIT
        </button>
      )}

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

      {/* Meter: shown when some move spends it */}
      {getConfig().player.moveset.some((t) => t.cost?.meter) && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', marginBottom: '3px' }}>
            METER{meter >= getConfig().rules.meter.max ? ' MAX' : ''}
          </div>
          <div style={{ width: '300px', height: '10px', backgroundColor: '#333', border: '2px solid #666', overflow: 'hidden' }}>
            <div
              data-meter={meter}
              style={{
                width: `${(meter / getConfig().rules.meter.max) * 100}%`,
                height: '100%',
                backgroundColor: '#44aaff',
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      )}

      {/* The weapon in hand: its name, hits left, and how to throw or drop it */}
      {weapon && weaponDef && (
        <div data-testid="hud-weapon" style={{ marginBottom: '10px', fontSize: '12px' }}>
          <div style={{ marginBottom: '3px' }}>
            🗡 {weaponDef.name.toUpperCase()}
            <span style={{ color: '#aab' }}>
              {' '}
              | {promptLabel(getBindings(), 'grab', inputDevice, padLabels ?? 'xbox')} - {weaponDef.throw ? 'Throw' : 'Drop'}
              {weaponDef.throw ? ` (+ ${promptLabel(getBindings(), 'backward', inputDevice, padLabels ?? 'xbox')} to drop)` : ''}
            </span>
          </div>
          {weapon.durability !== null && weaponDef.durability && (
            <div style={{ width: '150px', height: '6px', backgroundColor: '#333', border: '1px solid #666', overflow: 'hidden' }}>
              <div
                data-durability={weapon.durability}
                style={{ width: `${(weapon.durability / weaponDef.durability) * 100}%`, height: '100%', backgroundColor: '#ffd27a' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Score and lives */}
      <div style={{ fontSize: '20px', marginBottom: '10px' }}>
        SCORE: {score} | LIVES: {lives}
      </div>

      {/* Level and fight progress */}
      <div style={{ fontSize: '16px', marginBottom: '10px' }}>
        {sandbox ? 'FORGE SANDBOX' : `LEVEL ${levelIndex + 1}/${getLevels().length}: ${level.levelName.toUpperCase()}`}
        {level.waveLabel && ` | ${level.waveLabel.toUpperCase()}`}
        {` | ENEMIES: ${enemies.length}`}
      </div>

      <BossBar />

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
        {deviceHelp(getBindings(), inputDevice, padLabels ?? 'xbox', true, helpExtras(getConfig().input.actions))}
        <br />
        {actionLabel(getBindings().keyboard, 'hitboxes')} - Hitboxes and frame time{showHitboxes ? ' (ON)' : ''}
        {showHitboxes && <PerfReadout />}
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
            {isGameOver ? 'GAME OVER' : sandbox ? 'SANDBOX CLEAR' : lastLevel ? 'ALL LEVELS CLEAR!' : 'LEVEL COMPLETE'}
          </h1>
          <table style={{ margin: '0 auto 30px', fontSize: '20px', borderSpacing: '24px 6px' }}>
            <tbody>
              <ResultRow label="SCORE" value={score} />
              {level.complete && level.time !== null && <ResultRow label="TIME" value={formatTime(level.time)} />}
              {level.complete && level.bossTime !== null && <ResultRow label="BOSS TIME" value={formatTime(level.bossTime)} />}
              <ResultRow label="KOs" value={kos} />
              {level.complete && lastLevel && !sandbox && levelIndex > 0 && <ResultRow label="TOTAL KOs" value={runKos} />}
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
            {level.complete && sandbox && (
              <MenuButton primary onClick={resetGame}>
                FIGHT AGAIN
              </MenuButton>
            )}
            {level.complete && lastLevel && !sandbox && (
              <MenuButton primary onClick={() => startRun(0)}>
                PLAY AGAIN
              </MenuButton>
            )}
            {isGameOver && (
              <MenuButton primary={continuesLeft === 0} onClick={resetGame}>
                RESTART LEVEL
              </MenuButton>
            )}
            <MenuButton onClick={handleReturnToMenu}>{sandbox ? 'BACK TO FORGE' : 'MAIN MENU'}</MenuButton>
          </div>
        </div>
      )}
    </div>
  )
}
