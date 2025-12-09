# Fight Forge

A web-based, brawler engine and framework built on React and TypeScript. Fight Forge provides a complete game engine for creating 2D fighting games in the browser with physics, collision detection, and a flexible character system.

![Fight Forge Screenshot](https://github.com/user-attachments/assets/a0b84f2a-a2d2-432d-8098-b631836f836b)

## Features

- **Complete Game Engine**: Built-in game loop, physics system, and collision detection
- **Fighter System**: Customizable character states including idle, walking, jumping, attacking, blocking, and hit states
- **Physics Engine**: Gravity, friction, knockback, and ground collision
- **Input Handling**: Keyboard controls with customizable key bindings for multiple players
- **Health System**: Health bars, damage calculation, and win conditions
- **React Components**: Modular component architecture for easy customization
- **TypeScript**: Full type safety and IntelliSense support

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/hynding/fight-forge.git
cd fight-forge

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173/`

### Build

```bash
# Build for production
npm run build
```

The built files will be in the `dist/` directory.

### Linting

```bash
# Run ESLint
npm run lint
```

## Game Controls

### Player 1
- **A / D**: Move Left/Right
- **W**: Jump
- **Space**: Attack
- **Shift**: Block

### Player 2
- **← / →**: Move Left/Right
- **↑**: Jump
- **Enter**: Attack
- **Right Shift**: Block

## Architecture

### Core Engine (`/src/engine`)

- **GameEngine.ts**: Main game loop and state management
- **Physics.ts**: Physics calculations including gravity, friction, and collision detection

### Type System (`/src/types`)

- Comprehensive TypeScript definitions for fighters, game state, physics, and input

### Components (`/src/components`)

- **Fighter**: Visual representation of characters with health bars and state indicators
- **Stage**: Game arena with ground and visual styling
- **Controls**: UI component displaying control instructions

### Hooks (`/src/hooks`)

- **useGameEngine**: React hook for managing game state and engine lifecycle
- **useKeyboardInput**: React hook for handling keyboard input with customizable bindings

### Utilities (`/src/utils`)

- **gameFactory**: Helper functions for creating fighters and initial game state

## Customization

### Creating Custom Fighters

```typescript
import { createFighter } from './utils/gameFactory';

const myFighter = createFighter(
  'fighter1',     // ID
  100,            // X position
  300,            // Y position
  1               // Direction (1 = right, -1 = left)
);

// Customize stats
myFighter.stats.maxHealth = 150;
myFighter.stats.attackPower = 15;
myFighter.stats.speed = 5;
myFighter.stats.jumpForce = 15;
```

### Modifying Game Settings

Edit `/src/utils/gameFactory.ts` to change default fighter stats, stage dimensions, or initial positions.

### Adjusting Physics

Modify constants in `/src/engine/Physics.ts`:
- `GRAVITY`: Affects fall speed
- `FRICTION`: Affects ground sliding

## Project Structure

```
fight-forge/
├── src/
│   ├── engine/          # Game engine and physics
│   ├── components/      # React components
│   ├── hooks/          # Custom React hooks
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── App.tsx         # Main application component
│   └── main.tsx        # Application entry point
├── public/             # Static assets
├── index.html          # HTML template
└── package.json        # Project dependencies
```

## Technology Stack

- **React 19**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool and dev server
- **ESLint**: Code linting

## Future Enhancements

Potential features for future development:
- Sprite animations and visual assets
- Sound effects and music
- Combo system and special moves
- Multiple character types with unique abilities
- AI opponents
- Network multiplayer support
- Stage hazards and interactive environments
- Power-ups and items

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

Built with ❤️ using React and TypeScript
