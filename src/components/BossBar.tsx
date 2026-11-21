import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

/** How long the name card shows before the fight starts (any key or click skips it). UI timing, real time. */
const INTRO_SECONDS = 1.6

/**
 * The boss fight's HUD: a wide health bar across the bottom of the screen with
 * the boss's title, a tick at each phase threshold and a delayed trail behind
 * the fill so big hits read clearly; and the name card that holds the fight
 * for a moment as the boss arrives.
 */
export const BossBar = () => {
  const boss = useGameStore((s) => s.levelProgress.boss)
  const intro = useGameStore((s) => s.levelProgress.bossIntro)
  const enemy = useGameStore((s) => (boss ? s.enemies.find((e) => e.id === boss.id) : undefined))

  useEffect(() => {
    if (!intro) return
    const done = () => useGameStore.getState().setLevelProgress({ bossIntro: false })
    const timer = setTimeout(done, INTRO_SECONDS * 1000)
    // Any key, click or touch skips it (a key held from the fight doesn't repeat into it).
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && e.repeat) return
      done()
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [intro])

  if (!boss) return null
  const fraction = enemy ? Math.max(0, enemy.health / enemy.maxHealth) : 0

  return (
    <>
      {intro && (
        <div
          data-testid="boss-intro"
          style={{
            position: 'fixed',
            top: '38%',
            left: 0,
            right: 0,
            textAlign: 'center',
            background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.85) 80%, transparent)',
            padding: '18px 0',
            fontFamily: 'monospace',
            color: 'white',
            textShadow: '0 0 10px #000',
          }}
        >
          <div style={{ fontSize: '56px', fontWeight: 'bold', letterSpacing: '6px', color: '#ff5a5a' }}>{boss.title}</div>
          {boss.subtitle && <div style={{ fontSize: '20px', color: '#dddddd', marginTop: '6px' }}>{boss.subtitle}</div>}
        </div>
      )}
      <div
        data-testid="boss-bar"
        style={{ position: 'fixed', left: '10%', right: '10%', bottom: '24px', fontFamily: 'monospace', color: 'white', pointerEvents: 'none' }}
      >
        <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '3px', marginBottom: '4px', textShadow: '0 0 6px #000' }}>{boss.title}</div>
        <div style={{ position: 'relative', height: '16px', background: 'rgba(0,0,0,0.7)', border: '2px solid #ddd', borderRadius: '3px', overflow: 'hidden' }}>
          {/* The trail catches up after a moment, showing how much the last hits took. */}
          <div
            style={{ position: 'absolute', inset: 0, width: `${fraction * 100}%`, background: '#ffd27a', transition: 'width 0.5s ease-out 0.4s' }}
          />
          <div data-boss-fill={fraction.toFixed(3)} style={{ position: 'absolute', inset: 0, width: `${fraction * 100}%`, background: '#e0303a' }} />
          {boss.thresholds.map((t) => (
            <div key={t} style={{ position: 'absolute', top: 0, bottom: 0, left: `${t * 100}%`, width: '2px', background: '#ffffff', opacity: 0.8 }} />
          ))}
        </div>
      </div>
    </>
  )
}
