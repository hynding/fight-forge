import { useEffect, useState } from 'react'

export const LoadingScreen = () => {
  const [progress, setProgress] = useState(0)
  const [loadingText, setLoadingText] = useState('Loading')

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 5
      })
    }, 100)

    return () => clearInterval(interval)
  }, [])

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
        {progress}%
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
