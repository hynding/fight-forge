import { GameScene } from './components/GameScene'
import { StartMenu } from './components/StartMenu'
import { LoadingScreen } from './components/LoadingScreen'
import { useGameStore } from './store/gameStore'

function App() {
  const gameScreen = useGameStore((state) => state.gameScreen)

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {gameScreen === 'menu' && <StartMenu />}
      {gameScreen === 'loading' && <LoadingScreen />}
      {gameScreen === 'playing' && <GameScene />}
    </div>
  )
}

export default App
