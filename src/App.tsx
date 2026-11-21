import { GameScene } from './components/GameScene'
import { StartMenu } from './components/StartMenu'
import { LoadingScreen } from './components/LoadingScreen'
import { useGameStore } from './store/gameStore'
import { Forge } from './components/forge/Forge'
import { Gallery } from './components/Gallery'
import { MenuPad } from './components/MenuPad'
import { useEffect } from 'react'
import { apiEnabled, linkedPack } from './net/api'

function App() {
  const gameScreen = useGameStore((state) => state.gameScreen)
  const gameId = useGameStore((state) => state.gameId)
  const editing = useGameStore((state) => state.editing)

  // A shared link (?pack=<id>) opens straight to that pack in the gallery.
  useEffect(() => {
    if (apiEnabled() && linkedPack()) useGameStore.getState().setGameScreen('gallery')
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MenuPad />
      {gameScreen === 'menu' && <StartMenu />}
      {gameScreen === 'loading' && <LoadingScreen />}
      {gameScreen === 'gallery' && <Gallery />}
      {gameScreen === 'playing' && <GameScene key={gameId} />}
      {/* Mid-playtest, the Forge opens over the paused scene, which stays mounted. */}
      {(gameScreen === 'forge' || (gameScreen === 'playing' && editing)) && <Forge />}
    </div>
  )
}

export default App
