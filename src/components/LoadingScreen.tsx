import { useEffect, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useGameStore } from '../store/gameStore'
import { setActiveContent } from '../content/active'
import { defaultPack } from '../content/defaultPack'
import { loadContent } from '../content/load'
import { gltfModelUrls } from '../config/models'

// Keep the screen up at least this long so it doesn't just flash.
const MIN_DURATION_MS = 600

/**
 * Loads the run's content: validates the packs (just the default pack for
 * now; M2.3 adds pack selection), installs them as the active content, and
 * fetches every glTF model they use, then starts the game. Invalid content
 * stops here with the error list instead of starting a broken run.
 */
export const LoadingScreen = () => {
  const [progress, setProgress] = useState(0)
  const [loadingText, setLoadingText] = useState('Loading')
  const [status, setStatus] = useState('Checking content')
  const [error, setError] = useState<string | null>(null)
  const setGameScreen = useGameStore((state) => state.setGameScreen)

  useEffect(() => {
    // Cleared on unmount so a stale load can never yank the user into the game from another screen.
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const run = async () => {
      const result = loadContent([defaultPack()])
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setActiveContent(result.value)
      const urls = gltfModelUrls(result.value.config)
      setStatus(urls.length ? 'Loading models' : 'Ready')
      setProgress(urls.length ? 10 : 100)
      let done = 0
      await Promise.all(
        urls.map(async (url) => {
          // Warm the HTTP cache and start the parse, so the scene usually finds
          // models ready; a failed model falls back to the box humanoid in game.
          useGLTF.preload(url)
          await fetch(url).then((r) => r.blob()).catch(() => undefined)
          done++
          if (!cancelled) setProgress(10 + Math.round((90 * done) / urls.length))
        })
      )
      if (cancelled) return
      setStatus('Ready')
      timer = setTimeout(() => setGameScreen('playing'), Math.max(0, MIN_DURATION_MS - (Date.now() - started)))
    }
    void run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [setGameScreen])

  useEffect(() => {
    // Animated loading text
    const texts = ['Loading', 'Loading.', 'Loading..', 'Loading...']
    let index = 0
    const interval = setInterval(() => {
      setLoadingText(texts[index])
      index = (index + 1) % texts.length
    }, 300)

    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      {error && (
        <div style={{ position: 'absolute', inset: 0, background: '#120a0a', padding: '40px', overflow: 'auto', zIndex: 1 }}>
          <h2 style={{ color: '#ff4444', letterSpacing: '2px' }}>CONTENT ERRORS</h2>
          <p style={{ color: '#aaaaaa' }}>The game content failed validation, so the run can't start:</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffbbbb', fontSize: '13px' }}>{error}</pre>
          <button
            onClick={() => setGameScreen('menu')}
            style={{ marginTop: '20px', padding: '10px 24px', fontFamily: 'monospace', fontSize: '16px', cursor: 'pointer' }}
          >
            BACK TO MENU
          </button>
        </div>
      )}

      {/* Loading Text */}
      <h2 style={{
        fontSize: '32px',
        marginBottom: '40px',
        letterSpacing: '4px',
        color: '#ff4444',
      }}>
        {loadingText}
      </h2>

      {/* Progress Bar Container */}
      <div style={{
        width: '400px',
        height: '8px',
        backgroundColor: '#333',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '2px solid #555',
      }}>
        {/* Progress Bar Fill */}
        <div style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: '#ff4444',
          transition: 'width 0.3s ease',
          boxShadow: '0 0 10px rgba(255, 68, 68, 0.8)',
        }} />
      </div>

      {/* Progress Percentage */}
      <div style={{
        marginTop: '20px',
        fontSize: '18px',
        color: '#aaaaaa',
        letterSpacing: '2px',
      }}>
        {progress}% · {status}
      </div>

      {/* Loading Tips */}
      <div style={{
        position: 'absolute',
        bottom: '60px',
        textAlign: 'center',
        fontSize: '14px',
        color: '#666666',
        maxWidth: '500px',
        padding: '0 20px',
      }}>
        <div style={{ marginBottom: '10px', color: '#888888' }}>
          <strong>TIP:</strong>
        </div>
        <div>
          Use directional movement to position your attacks. Enemies will chase you when you get close!
        </div>
      </div>

      {/* Spinning Icon */}
      <div style={{
        position: 'absolute',
        top: '30%',
        width: '60px',
        height: '60px',
        border: '4px solid rgba(255, 68, 68, 0.2)',
        borderTop: '4px solid #ff4444',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}
