# Implementation Strategy

> **Context:** This document evaluates different technical approaches for building this 3D first-person simulator, with an eye toward future goals: custom 3D assets (GLTF models), sprite systems, skeletal animation, physics, and a codebase that scales without becoming unmaintainable.

---

## The Decision We Made (and Why It Was Correct for Now)

The current `index.html` loads Three.js from a CDN and runs as a single file. This was the right first choice: zero setup friction, immediate results, and a clean surface for learning concepts. But it is a **dead end for a real project**. The document you're reading exists precisely because the path forward branches here.

---

## Approach 1: Current — Vanilla HTML + Three.js CDN

**What it is:** A single `.html` file. Three.js is loaded via a `<script>` tag from `cdnjs.cloudflare.com`. All game code lives in one `<script>` block.

### Advantages

- **Zero setup.** Open the file in a browser. Done. No Node.js, no terminal, no npm.
- **Instant feedback.** Edit the file, refresh, see the result.
- **Great for learning.** Every concept is visible in one place. No abstraction layers hiding the mechanics.
- **Portable.** The file can be shared or opened anywhere.

### Disadvantages

- **No module system.** Everything lives in one global scope. As the project grows, you'll have hundreds of variables and functions all competing in the same namespace. This becomes unmanageable quickly.
- **No package management.** Want to add a physics engine, a GLTF loader, a post-processing library? You'd have to find CDN links for every dependency and hope their versions are compatible with each other.
- **No tree shaking.** The CDN version of Three.js ships the entire library — even parts you never use. The npm version lets bundlers strip unused code, resulting in smaller, faster downloads.
- **CDN dependency.** If `cdnjs.cloudflare.com` goes down or the URL changes, your game breaks.
- **No hot module replacement.** Every change requires a full page refresh, losing game state.
- **Impossible to organize at scale.** Assets, systems, entities, UI — all of it smashed into one file. There's no way to split this across multiple files without a module bundler.
- **Animations and custom assets are painful.** Loading a GLTF model with skeletal animation requires `GLTFLoader`, which is not included in the base CDN bundle. You'd need separate CDN imports for every Three.js addon.

**Verdict:** Good for prototyping and learning. Unworkable for a serious project.

---

## Approach 2: Vite + Three.js (No Framework)

**What it is:** You install [Vite](https://vitejs.dev/) as a build tool and Three.js as an npm package. Your game code is split across multiple `.js` files using ES module `import`/`export`. Vite serves your project locally with hot reload during development and bundles it for production.

```
project/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.js          ← entry point
    ├── scene.js         ← scene setup
    ├── player.js        ← movement + camera
    ├── world.js         ← environment geometry
    ├── assets/
    │   ├── building.glb
    │   └── grass.png
    └── systems/
        ├── input.js
        ├── physics.js
        └── animation.js
```

### Setup

```bash
npm create vite@latest my-3d-game -- --template vanilla
cd my-3d-game
npm install three
npm run dev   # starts local server with hot reload at localhost:5173
```

### Advantages

- **Full npm ecosystem.** Every Three.js addon is available: `GLTFLoader`, `PointerLockControls`, `AnimationMixer`, postprocessing, physics wrappers. Install anything with `npm install`.
- **Proper module system.** Split your code cleanly across files. Import only what you need.
- **Hot module replacement.** Vite watches your files and reloads changed modules without a full page refresh. Tweak a number, see it update instantly.
- **Tree shaking.** Your production bundle only includes code you actually imported. Significantly smaller than the CDN bundle.
- **Three.js type definitions.** With `@types/three`, your editor gives you autocompletion, parameter hints, and type errors on Three.js objects.
- **Easier asset pipeline.** Vite handles image imports, JSON imports, and with plugins: GLTF optimization, texture compression.
- **No framework overhead.** If you want maximum control over the rendering loop with no abstraction layer between you and Three.js, this is that.

### Disadvantages

- **Requires Node.js.** The developer must have Node.js installed and be comfortable running terminal commands.
- **More boilerplate.** You manage the render loop, scene lifecycle, and object organization entirely yourself.
- **No built-in component architecture.** As the scene grows (player, enemies, pickups, UI, cutscenes), you'll need to invent your own system for managing objects, or discover you've accidentally re-invented a component framework.
- **Scaling requires discipline.** Vanilla JS scales as well as the patterns you impose on it. Without enforced structure, large projects become hard to maintain.

### Asset support at this level

| Feature | How |
|---|---|
| GLTF models | `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'` |
| Skeletal animation | `THREE.AnimationMixer` — drive bone transforms from GLTF clips |
| Sprites | `THREE.Sprite` + `THREE.SpriteMaterial` — always faces camera |
| Particle systems | `THREE.Points` — thousands of small sprites rendered in one draw call |
| Post-processing | `three/examples/jsm/postprocessing/EffectComposer` |
| Physics | `npm install cannon-es` or `npm install @dimforge/rapier3d-compat` |

**Verdict:** The right choice if you want to stay close to raw Three.js, understand exactly what's happening, and don't already have a framework investment. Scales well with good code organization. Recommended as a **solid intermediate target**.

---

## Approach 3: Vite + React + React Three Fiber + Drei ⭐ Recommended

**What it is:** React Three Fiber (R3F) is a React renderer for Three.js. Instead of calling `scene.add(mesh)` imperatively, you describe your 3D scene declaratively as JSX components. Drei (`@react-three/drei`) is a companion library of pre-built components and hooks for common 3D needs.

```
project/
├── index.html
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/
    │   ├── Player.jsx       ← camera, controls, movement
    │   ├── World.jsx        ← environment
    │   ├── Building.jsx     ← reusable building component
    │   ├── Tree.jsx         ← reusable tree component
    │   └── Enemy.jsx        ← an NPC entity
    ├── hooks/
    │   ├── useInput.js      ← keyboard/mouse state
    │   └── usePhysics.js    ← physics body hooks
    ├── systems/
    │   └── collision.js
    └── assets/
        ├── models/
        └── textures/
```

### Setup

```bash
npm create vite@latest my-3d-game -- --template react
cd my-3d-game
npm install three @react-three/fiber @react-three/drei
npm run dev
```

### What it looks like

```jsx
import { Canvas, useFrame } from '@react-three/fiber'
import { PointerLockControls, Sky, useGLTF } from '@react-three/drei'
import { useRef } from 'react'

function Building({ position, color, size }) {
    return (
        <mesh position={position} castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}

function AnimatedCharacter() {
    const { scene, animations } = useGLTF('/models/character.glb')
    const mixer = useRef()

    useFrame((state, delta) => {
        mixer.current?.update(delta)  // advance animation every frame
    })

    return <primitive object={scene} />
}

export default function App() {
    return (
        <Canvas shadows camera={{ fov: 75, position: [0, 1.7, 0] }}>
            <Sky sunPosition={[100, 10, 100]} />
            <ambientLight intensity={0.45} />
            <directionalLight position={[60, 90, 40]} castShadow intensity={1.1} />

            <PointerLockControls />

            <mesh rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                <planeGeometry args={[300, 300]} />
                <meshLambertMaterial color="#4a7c45" />
            </mesh>

            <Building position={[-5, 3, -10]} color="#8B6355" size={[3, 6, 3]} />
            <Building position={[6, 2, -9]}  color="#6B8E9F" size={[4, 4, 4]} />

            <AnimatedCharacter />
        </Canvas>
    )
}
```

### Advantages

- **You already know React.** Your existing mental models for components, props, state, effects, and hooks transfer directly. A `Building` component in 3D is as natural as a `Button` component in 2D.
- **Declarative scene composition.** Adding an object to the scene is adding a JSX tag. Removing it is removing the tag. No manual `scene.add()` / `scene.remove()` lifecycle management.
- **State-driven 3D.** React state drives the scene graph. `isEnemyAlive` becomes a boolean that controls whether the enemy mesh is rendered. Inventory, health, game phase — all standard React state that the 3D scene can read.
- **`useFrame` hook.** The cleanest possible game loop interface: a hook that runs your callback every frame with `(state, delta)`. No clock management, no requestAnimationFrame juggling.
- **Drei's pre-built components.** Instead of implementing first-person controls from scratch: `<PointerLockControls />`. Instead of loading a GLTF and wiring up animations: `useGLTF()` hook. Shadows, environment maps, instanced meshes, physics, postprocessing — all one import away.
- **Scales with React's component model.** An enemy is a `<Enemy />` component. 50 enemies are 50 `<Enemy />` tags (or a `.map()`). Each encapsulates its own state, animation, and behavior.
- **React DevTools.** Inspect the 3D scene like you inspect a DOM tree. See component hierarchies, props, state in real time.
- **Ecosystem maturity.** R3F has a large, active community. `@react-three/rapier` for physics, `@react-three/postprocessing` for effects, `maath` for math utilities, `leva` for debug controls. All designed to work together.

### Disadvantages

- **One more abstraction layer.** R3F sits on top of Three.js. If something goes wrong deep in a shader or a loader, understanding the error requires knowing both React's reconciliation model and Three.js internals.
- **React overhead for low-level code.** The React reconciler adds a small overhead compared to calling Three.js directly. For extremely performance-critical paths (thousands of particles, complex physics), you may need to escape the abstraction and use `useThree()` to access the raw Three.js objects.
- **Learning curve for R3F patterns.** `useFrame`, `useThree`, `useLoader`, `extend` — R3F has its own set of idioms on top of React.
- **Requires Node.js + npm.** Same requirement as Approach 2.

### Why this is the recommended path for your goals

| Goal | R3F Solution |
|---|---|
| Custom 3D models (GLTF) | `useGLTF('/model.glb')` — loads, parses, caches |
| Skeletal animation | `useAnimations(animations, ref)` from Drei |
| Sprite system | `<Billboard>` + `<Sprite>` components from Drei |
| Particle effects | `@react-three/drei`'s `<Sparkles>` or raw `THREE.Points` inside `useFrame` |
| Physics + collision | `@react-three/rapier` — declarative rigid bodies |
| Post-processing | `@react-three/postprocessing` — bloom, depth of field, SSAO |
| Level streaming | Conditional rendering + React.lazy + Suspense |
| UI overlays | Standard React/DOM components alongside the Canvas |
| Game state | Zustand or Jotai — lightweight state managers popular in the R3F community |
| Multiple scenes/levels | React Router or conditional rendering |

---

## Approach 4: Babylon.js

**What it is:** Babylon.js is a competing 3D engine to Three.js. Rather than being a low-level rendering library, it positions itself as a fuller game engine: built-in physics integration, a scene inspector, an animation editor, built-in collision detection, and its own React wrapper (`react-babylonjs`).

### Advantages

- **More built-in features.** Collision detection, physics, animation state machines, a GUI library — these are part of Babylon.js itself, not third-party addons.
- **Babylon Inspector.** A powerful in-browser scene debugger that shows the scene graph, material properties, performance stats, and lets you tweak values live.
- **First-class TypeScript.** Babylon.js was written in TypeScript from the start; type safety is excellent.
- **Better WebGPU support.** Babylon.js has more mature WebGPU integration than Three.js (as of 2025-2026).

### Disadvantages

- **Much smaller ecosystem.** Three.js has significantly more community tutorials, examples, addons, and Stack Overflow answers. Learning resources are harder to find.
- **Different paradigm.** Babylon.js has its own opinionated way of doing things. Coming from Three.js knowledge (or planning to learn Three.js concepts), you'd be learning a parallel set of APIs.
- **You already have a Three.js foundation.** The concepts document you have, the code you've written — all of it is Three.js. Switching now means starting over.
- **Heavier.** The full Babylon.js bundle is significantly larger than Three.js.

**Verdict:** A serious engine, worth knowing exists. Not the right choice given your existing investment in Three.js concepts.

---

## Approach 5: Full Game Engines (Godot, Unity WebGL)

**What it is:** Professional game engines that export to WebAssembly and run in the browser. Godot is open-source and free. Unity has a WebGL export target (with licensing costs for commercial products).

### Advantages

- **Purpose-built for games.** Physics, animation state machines, audio, scene editors, asset importers — all built in, with GUIs.
- **Visual editors.** Place objects in a 3D viewport rather than specifying coordinates in code.
- **Mature asset pipeline.** Import FBX, GLTF, PSD, WAV — the engine handles format conversion.

### Disadvantages

- **Web output is a wrapper, not native browser code.** The game compiles to WebAssembly and runs inside a canvas. You lose integration with the web platform (React, DOM, standard browser APIs).
- **You're not writing a browser game anymore.** The browser is just a runtime container. Web-specific features (deep links, URL sharing, Web Audio API, Web Components) become awkward or impossible.
- **Much larger download sizes.** A minimal Godot WebAssembly export is 20-30MB+ before your game data. Three.js is 600KB.
- **Separate toolchain.** You'd need to learn Godot's GDScript or C#, or Unity's C# — separate languages from JavaScript.
- **Defeats your existing skill stack.** You've built browser games with React. That knowledge is directly leveraged by R3F. Moving to Godot or Unity is starting from scratch in a new paradigm.

**Verdict:** Excellent tools for standalone game development. Wrong choice for browser-native, web-integrated 3D experiences built by someone with a JavaScript/React background.

---

## Migration Path: From Here to There

The clean sequence from where you are now to a scalable production setup:

### Step 1: Set up Vite + Three.js (spend a weekend)

```bash
npm create vite@latest 3d-game -- --template vanilla
cd 3d-game
npm install three @types/three
```

Port `index.html` into this structure. Get comfortable with:
- `import * as THREE from 'three'`
- `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'`
- Splitting code across files

This gives you the npm ecosystem and a proper module system.

### Step 2: Add React Three Fiber (spend another weekend)

```bash
npm create vite@latest 3d-game-r3f -- --template react
npm install three @react-three/fiber @react-three/drei
```

Rebuild the game using R3F. The goal is to get the same first-person explorer working with JSX, `useFrame`, and `<PointerLockControls />`. Notice how much shorter and cleaner it is.

### Step 3: Add your first custom asset

Download a free GLTF model from [Sketchfab](https://sketchfab.com/features/free-3d-models) or create one in Blender. Load it:

```jsx
import { useGLTF } from '@react-three/drei'

function Tree({ position }) {
    const { scene } = useGLTF('/models/tree.glb')
    return <primitive object={scene.clone()} position={position} />
}
```

Once you have asset loading working, every subsequent asset follows the same pattern.

### Step 4: Add physics

```bash
npm install @react-three/rapier
```

```jsx
import { Physics, RigidBody } from '@react-three/rapier'

<Physics>
    <RigidBody type="fixed">
        <mesh>  {/* ground — static, doesn't move */}
            <planeGeometry args={[100, 100]} />
        </mesh>
    </RigidBody>

    <RigidBody>
        <mesh position={[0, 5, 0]}>  {/* box — falls with gravity */}
            <boxGeometry />
        </mesh>
    </RigidBody>
</Physics>
```

At this point you have real collision detection and gravity for free.

---

## Decision Matrix

| Criteria | HTML + CDN | Vite + Three.js | Vite + R3F | Babylon.js | Game Engine |
|---|---|---|---|---|---|
| Setup friction | None | Low | Low | Low | High |
| Scales to large projects | ✗ | ✓ | ✓✓ | ✓ | ✓ |
| Custom GLTF assets | Painful | ✓ | ✓✓ | ✓ | ✓ |
| Skeletal animation | Very painful | ✓ | ✓✓ | ✓✓ | ✓✓ |
| Sprite systems | Painful | ✓ | ✓✓ | ✓ | ✓✓ |
| Physics integration | Very painful | ✓ | ✓✓ (Rapier) | ✓✓ (built-in) | ✓✓ (built-in) |
| React skills reused | ✗ | ✗ | ✓✓ | Partial | ✗ |
| Ecosystem size | — | Large | Large | Medium | Large |
| Browser-native | ✓ | ✓ | ✓ | ✓ | ✗ (WASM wrapper) |
| Learning resources | Good | Excellent | Excellent | Good | Excellent |

---

## Recommendation

**Migrate to Vite + React Three Fiber.**

You already build games with React components. The mental model (components, state, hooks) is already yours. R3F gives you that same paradigm for 3D, on top of the best-documented 3D library on the web. The `ENGINEERING_CONCEPTS.md` file in this project covers all the Three.js fundamentals that R3F sits on top of — you already understand what's happening underneath the abstraction.

The CDN approach in `index.html` was the right first step. Now that you understand the concepts, the next step is graduating to a proper toolchain so you can build something real.

---

*Every game engine, every graphics library, every rendering approach is ultimately doing the same thing: uploading triangles to a GPU, running shaders, and presenting pixels at 60 frames per second. The difference is in the ergonomics, the ecosystem, and how far the abstractions let you go before you have to reach underneath them.*
