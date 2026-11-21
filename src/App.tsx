import { GameScene } from './components/GameScene'
import { StartMenu } from './components/StartMenu'
import { LoadingScreen } from './components/LoadingScreen'
import { useGameStore } from './store/gameStore'
import { Forge } from './components/forge/Forge'

function App() {
  const gameScreen = useGameStore((state) => state.gameScreen)
  const gameId = useGameStore((state) => state.gameId)
  const editing = useGameStore((state) => state.editing)

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {gameScreen === 'menu' && <StartMenu />}
      {gameScreen === 'loading' && <LoadingScreen />}
      {gameScreen === 'playing' && <GameScene key={gameId} />}
      {/* Mid-playtest, the Forge opens over the paused scene, which stays mounted. */}
      {(gameScreen === 'forge' || (gameScreen === 'playing' && editing)) && <Forge />}
    </div>
  )
}

export default App
