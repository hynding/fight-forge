# Fight Forge

A 3D brawler built with React, Three.js and Rapier physics, growing into a **side-scrolling beat 'em up that creators can customize**: characters, moves, enemies, levels and rules as shareable content packs, edited in an in-browser editor.

The game today is a playable prototype: a single arena where you fight waves of enemies. See the [roadmap](docs/ROADMAP.md) for where it is headed.

## Play locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Space | Jump |
| J | Attack |
| Esc | Pause |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck, then build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (any warning fails) |
| `npm test` | Run the Vitest unit tests once |

CI runs lint, tests and build on every pull request.

## Tech stack

React 18, TypeScript, Vite, [`@react-three/fiber`](https://github.com/pmndrs/react-three-fiber), [`@react-three/drei`](https://github.com/pmndrs/drei), [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) and [`zustand`](https://github.com/pmndrs/zustand). Architecture notes for contributors are in [CLAUDE.md](CLAUDE.md).

## License

See [LICENSE](LICENSE).
