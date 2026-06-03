# 3D Simulator

A first-person 3D world built with React Three Fiber. Walk through an environment of buildings, trees, and rocks with smooth first-person controls.

## Controls

| Input | Action |
|---|---|
| Click | Lock mouse / start |
| W A S D | Move |
| Arrow Keys | Move (alternate) |
| Mouse | Look around |
| Shift | Sprint |
| ESC | Pause / release mouse |

## Getting Started

Requires [Node.js](https://nodejs.org/) (v18 or newer).

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Project Structure

```
src/
├── main.jsx                  # Entry point
├── App.jsx                   # Root — Canvas setup, lock state, wiring
├── index.css                 # Global reset
├── hooks/
│   └── useKeyboard.js        # Keyboard state hook (used in Player)
└── components/
    ├── Player.jsx            # Camera movement + PointerLockControls
    ├── World.jsx             # Ground plane + grid
    ├── Buildings.jsx         # All box structures (data-driven)
    ├── Trees.jsx             # Trunk + canopy trees
    ├── Rocks.jsx             # Sphere boulders
    ├── Landmark.jsx          # Distant obelisk
    └── Overlay.jsx           # Start screen + HUD (DOM, not 3D)
```

## Tech Stack

| Package | Role |
|---|---|
| [Three.js](https://threejs.org/) | 3D rendering via WebGL |
| [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) | React renderer for Three.js |
| [@react-three/drei](https://github.com/pmndrs/drei) | Helpers — `PointerLockControls`, etc. |
| [React 18](https://react.dev/) | Component model + state |
| [Vite](https://vitejs.dev/) | Dev server + build tool |

## npm Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server with hot reload |
| `npm run build` | Build optimized output to `dist/` |
| `npm run preview` | Preview the production build locally |

## Learning

| File | Covers |
|---|---|
| `ENGINEERING_CONCEPTS.md` | Three.js fundamentals — coordinates, meshes, lighting, cameras, shadow mapping, the game loop |
| `ENGINEERING_CONCEPTS_R3F.md` | This codebase — npm, Vite, React, R3F reconciler, hooks, refs vs state, the LockBridge pattern |
| `implementation_strategy.md` | Why this stack was chosen over alternatives (vanilla HTML, Babylon.js, game engines) |

## Adding to the Scene

**New building:** add one entry to the `BUILDINGS` array in `src/components/Buildings.jsx`.

**New tree position:** add `[x, z]` to the `POSITIONS` array in `src/components/Trees.jsx`.

**Custom 3D model:** create a new component using Drei's `useGLTF` hook and drop it into `App.jsx`.

```jsx
import { useGLTF } from '@react-three/drei'

export default function MyModel() {
  const { scene } = useGLTF('/models/my-model.glb')
  return <primitive object={scene} position={[0, 0, -10]} />
}
```

Place `.glb` files in a `public/models/` folder — Vite serves the `public/` directory at the root URL.
