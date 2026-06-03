# Engineering Concepts: The React Three Fiber Version

> **Who this is for:** Engineers who have read `ENGINEERING_CONCEPTS.md` (the vanilla Three.js version) and want to understand what changes — and why — when you move to a proper toolchain with Vite, React, React Three Fiber, and Drei. We build every concept from first principles, again. Nothing is assumed except that you've read the previous document.

---

## Table of Contents

1. [Why the Toolchain Exists at All](#1-why-the-toolchain-exists-at-all)
2. [npm: The Package Manager](#2-npm-the-package-manager)
3. [ES Modules: The Module System](#3-es-modules-the-module-system)
4. [Vite: The Build Tool](#4-vite-the-build-tool)
5. [React from First Principles](#5-react-from-first-principles)
6. [JSX: HTML-Looking JavaScript](#6-jsx-html-looking-javascript)
7. [Props: Passing Data into Components](#7-props-passing-data-into-components)
8. [State: Data That Triggers Re-renders](#8-state-data-that-triggers-re-renders)
9. [Refs: Mutable Values That Don't Re-render](#9-refs-mutable-values-that-dont-re-render)
10. [Effects: Synchronizing with the Outside World](#10-effects-synchronizing-with-the-outside-world)
11. [Custom Hooks: Reusable Stateful Logic](#11-custom-hooks-reusable-stateful-logic)
12. [React Three Fiber: The Reconciler](#12-react-three-fiber-the-reconciler)
13. [The Canvas Component](#13-the-canvas-component)
14. [R3F Primitive Naming: The Lowercase Convention](#14-r3f-primitive-naming-the-lowercase-convention)
15. [The attach Prop](#15-the-attach-prop)
16. [useFrame: The R3F Game Loop](#16-useframe-the-r3f-game-loop)
17. [useThree: Accessing the Three.js Context](#17-usethree-accessing-the-threejs-context)
18. [Refs vs State in a Game Loop](#18-refs-vs-state-in-a-game-loop)
19. [The useKeyboard Hook](#19-the-usekeyboard-hook)
20. [Drei: The Component Library](#20-drei-the-component-library)
21. [PointerLockControls as a Component](#21-pointerlockcontrols-as-a-component)
22. [The LockBridge Pattern: Crossing the Canvas Boundary](#22-the-lockbridge-pattern-crossing-the-canvas-boundary)
23. [Data-Driven Rendering: Arrays to JSX](#23-data-driven-rendering-arrays-to-jsx)
24. [Component Decomposition and Scalability](#24-component-decomposition-and-scalability)
25. [The group Component and Scene Organization](#25-the-group-component-and-scene-organization)
26. [Shadow Props: R3F's Prop Piercing Syntax](#26-shadow-props-r3fs-prop-piercing-syntax)
27. [Null-Rendering Components](#27-null-rendering-components)
28. [The Full Mental Model: How It All Fits Together](#28-the-full-mental-model-how-it-all-fits-together)

---

## 1. Why the Toolchain Exists at All

The original game was a single `index.html` file. It worked, but it had a fundamental constraint: everything had to live in one `<script>` block, and Three.js had to be loaded from a CDN URL. You couldn't split the code across files, you couldn't easily add new libraries, and you had no way to verify that your code was correct before running it.

This is fine for a proof of concept. It is not fine for a project you intend to grow.

The new version solves these problems with a **toolchain** — a set of programs that run on your development machine (not in the browser) and transform your source code into something the browser can run. The toolchain does three things:

**1. Dependency management:** You declare what libraries your project needs (React, Three.js, R3F, Drei) and a tool called `npm` downloads them. You never hunt for CDN links again.

**2. Module bundling:** Your code is split across many files. A tool called Vite understands the dependencies between your files and stitches them together into a final bundle the browser loads.

**3. Development experience:** Vite serves your project locally with instant hot-reload — change a file, and the browser updates within milliseconds without losing game state.

The tradeoff: you now have a `node_modules` folder, a `package.json`, a `vite.config.js`, and a terminal command you must run before you can open the project. This overhead is worth it for any project beyond a prototype.

---

## 2. npm: The Package Manager

### What it is

**npm** (Node Package Manager) is a command-line tool that ships with Node.js. It manages **packages** — reusable libraries of JavaScript code published to the npm registry at `registry.npmjs.org`. There are over two million packages there.

### `package.json`: the project manifest

Every npm project has a `package.json` file. This is the source of truth for your project's identity and its dependencies:

```json
{
  "name": "3d-simulator",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@react-three/fiber": "^8.16.0",
    "three": "^0.164.0",
    "react": "^18.3.0"
  },
  "devDependencies": {
    "vite": "^5.3.0"
  }
}
```

**`dependencies`** — packages required for the project to run in production (in the browser).

**`devDependencies`** — packages only needed during development (build tools, type checkers). Vite itself is a devDependency: it builds the code but doesn't ship to the browser.

**The `^` version prefix** means "compatible with this version" — npm will install the specified version or any newer minor/patch version. `^8.16.0` means "any 8.x.x ≥ 8.16.0".

### `npm install`

When you run `npm install`:
1. npm reads `package.json`
2. Downloads every listed package (and all of their dependencies) from the registry
3. Stores them in a `node_modules/` folder
4. Creates a `package-lock.json` that records the exact version of every installed package

`node_modules` is never committed to version control (it's in `.gitignore`) because it can be gigabytes in size and is fully reproducible from `package.json`. Anyone who clones the repository just runs `npm install` to recreate it.

### npm scripts

`"dev": "vite"` means: when you run `npm run dev`, execute the `vite` command. `npm run` finds executables inside `node_modules/.bin/` without you needing to install them globally. This is how you run project-local tools.

---

## 3. ES Modules: The Module System

### The problem with scripts

In the browser's original model, every `<script>` tag loads a file into the global scope. Every variable declared at the top level of that file becomes a global. If two files both declare `const mesh = ...`, they collide. With one giant `<script>` block, there's no collision — but also no organization.

### ES Modules: named exports and imports

ES Modules (ESM) give JavaScript a proper module system, built into the language since ES2015:

```javascript
// math.js — exports a function
export function normalize(v) {
  const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z)
  return { x: v.x/len, y: v.y/len, z: v.z/len }
}

// player.js — imports it
import { normalize } from './math.js'
```

Each file has its own scope. Nothing leaks into the global namespace. The `import` statement explicitly declares what a file depends on. This is how every other major programming language works — Python's `import`, C's `#include`, Go's `import`.

### Default vs named exports

```javascript
// Named export — import with exact name in curly braces
export function useKeyboard() { ... }
import { useKeyboard } from './hooks/useKeyboard.js'

// Default export — one per file, import with any name you choose
export default function Player() { ... }
import Player from './components/Player.jsx'
import MyPlayer from './components/Player.jsx' // also valid
```

In our codebase, every component file has one default export (the component) and sometimes named exports for helper data.

### `"type": "module"` in package.json

This tells Node.js to treat `.js` files as ES modules instead of CommonJS (the older Node.js module format that uses `require()` instead of `import`). Without this, Vite's dev server may behave unexpectedly. Always include it in new projects.

---

## 4. Vite: The Build Tool

### What Vite does

**Vite** (French for "fast") is a development server and build tool. It has two modes:

**Development mode (`npm run dev`):**
- Starts a local HTTP server (usually at `localhost:5173`)
- Serves your source files directly as ES modules — no bundling step required
- Uses your browser's native ESM support to load files on demand
- Watches for file changes and applies **Hot Module Replacement (HMR)**: the changed module is swapped out in the running browser without a full page reload

**Production mode (`npm run build`):**
- Runs Rollup (a bundler) to combine all your modules into optimized chunks
- Tree-shakes — removes code that's imported but never called
- Minifies — strips whitespace and shortens variable names
- Outputs static files to a `dist/` folder ready to deploy to any web server

### Why HMR matters for development

Without HMR, every code change requires a full page reload. In a game, this means your player teleports back to spawn, all runtime state is lost, and you wait 2-3 seconds for the page to load. With HMR, you change the color of a building and see it update in under 100ms while the player stays in place. This is a dramatic improvement in iteration speed.

### The `vite.config.js`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

`@vitejs/plugin-react` adds JSX transform support (converting JSX syntax to `React.createElement` calls) and React-specific HMR. Without this plugin, Vite wouldn't know how to handle `.jsx` files.

---

## 5. React from First Principles

React is a JavaScript library for building user interfaces. Its core idea is simple: **describe what the UI should look like, given the current state, and let React figure out how to update the DOM to match.**

### The problem React solves

Imagine a scoreboard that shows a player's health. Without React, you'd write imperative DOM code:

```javascript
// Somewhere, the player takes damage
player.health -= 10

// Then manually find and update every piece of UI that shows health
document.getElementById('health-bar').style.width = player.health + '%'
document.getElementById('health-number').textContent = player.health
document.getElementById('danger-overlay').style.display = player.health < 20 ? 'block' : 'none'
```

Every piece of UI that depends on `player.health` must be manually updated. As the UI grows, this becomes an unmanageable web of imperative updates.

React's solution: you describe the UI as a **function of state**. When state changes, React re-runs the function and figures out the minimal set of DOM changes needed:

```jsx
function HealthBar({ health }) {
  return (
    <div>
      <div style={{ width: health + '%' }} />
      <span>{health}</span>
      {health < 20 && <div className="danger-overlay" />}
    </div>
  )
}
```

Now you just update the state (`health`), and React handles all the DOM updates automatically.

### Components: the fundamental unit

A React **component** is a function that accepts data (props) and returns a description of UI (JSX). That's it. Everything in React is a component:

```jsx
function Building({ color, height }) {
  return (
    <mesh position={[0, height/2, 0]}>
      <boxGeometry args={[3, height, 3]} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}
```

Components are composable — you build complex UIs by combining simpler components, just like you build complex programs by combining functions.

### The component tree

React applications are trees of components. At the top is the root component (our `App`). It renders children, which render their own children, all the way down to primitive elements (`<div>`, `<mesh>`, `<boxGeometry>`).

```
App
├── Canvas
│   ├── Player (→ PointerLockControls)
│   ├── World (→ mesh + gridHelper)
│   ├── Buildings (→ many Building meshes)
│   ├── Trees (→ many Tree groups)
│   ├── Rocks (→ many Rock meshes)
│   ├── Landmark (→ two meshes)
│   └── LockBridge (→ null)
└── Overlay (→ DOM divs)
```

---

## 6. JSX: HTML-Looking JavaScript

JSX is a syntax extension for JavaScript that looks like HTML but is actually JavaScript. It is not a template language — it compiles to regular JavaScript function calls.

```jsx
// You write:
const element = <Building color="red" height={4} />

// Vite compiles this to:
const element = React.createElement(Building, { color: "red", height: 4 })
```

`React.createElement(type, props)` creates a **React element** — a plain JavaScript object describing a node in the component tree. React elements are lightweight descriptions, not actual DOM nodes or Three.js objects.

### JSX rules

**Expressions in curly braces:** Any JavaScript expression can go inside `{}`:
```jsx
<mesh position={[0, height / 2, 0]}>   // array literal
<meshLambertMaterial color={color} />   // variable
{health < 20 && <DangerOverlay />}      // conditional
{buildings.map(b => <Building key={b.id} {...b} />)} // array of elements
```

**A component must return one root element.** If you need to return multiple elements without a wrapping container, use a **Fragment**:
```jsx
return (
  <>
    <Overlay />
    <Canvas />
  </>
)
// The <> </> is shorthand for <React.Fragment> </React.Fragment>
// It renders no DOM element — it's just a grouping device
```

**JSX is not HTML.** Class is `className`. Style takes an object, not a string. Self-closing tags must end with `/>`.

---

## 7. Props: Passing Data into Components

**Props** (short for properties) are the arguments you pass to a component. They flow **downward** — from parent to child. A child cannot modify its props; props are read-only from the child's perspective.

```jsx
// Parent passes props
<Building pos={[-5, -10]} dims={[3, 6, 3]} color="#8B6355" />

// Child receives them
function Building({ pos: [x, z], dims: [w, h, d], color }) {
  // pos, dims, color are available here
  // but we cannot do: color = 'blue' — props are read-only
  return (
    <mesh position={[x, h / 2, z]}>
      <boxGeometry args={[w, h, d]} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}
```

### Destructuring props

`{ pos: [x, z], dims: [w, h, d], color }` is destructuring with renaming and nested destructuring in the function signature. `pos` is renamed to `[x, z]` (an array being unpacked). This is purely JavaScript — not React syntax.

### Spread props

```jsx
// Instead of:
<Building pos={b.pos} dims={b.dims} color={b.color} />

// Spread the whole object:
<Building {...b} />
// Equivalent: passes every key of `b` as a prop
```

### Callbacks as props

Functions can be props too. This is how children communicate upward to parents:

```jsx
// Parent defines the function and passes it down
<Player onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />

// Child calls it when the event occurs
function Player({ onLock, onUnlock }) {
  const handleLock = () => {
    isLocked.current = true
    onLock?.()     // ?. is optional chaining — only calls if onLock is not null/undefined
  }
  // ...
}
```

The child doesn't know what `onLock` does — it just calls it. The parent decides the behavior. This is the principle of **inversion of control**.

---

## 8. State: Data That Triggers Re-renders

**State** is data that, when changed, tells React to re-render the component (and its children). State lives inside a component and is created with the `useState` hook:

```jsx
import { useState } from 'react'

function App() {
  const [locked, setLocked] = useState(false)
  // locked: the current value (false initially)
  // setLocked: a function to update it

  return (
    <>
      <Canvas>
        <Player
          onLock={()   => setLocked(true)}   // called from inside Canvas
          onUnlock={() => setLocked(false)}
        />
      </Canvas>
      <Overlay locked={locked} />   // re-renders when locked changes
    </>
  )
}
```

When `setLocked(true)` is called, React schedules a re-render of `App`. The function body runs again with `locked = true`. `Overlay` receives the new prop and re-renders, hiding the start screen.

### Why state, not a plain variable?

```jsx
// WRONG — React doesn't know this changed
let locked = false
function handleLock() { locked = true }

// CORRECT — React re-renders when this changes
const [locked, setLocked] = useState(false)
function handleLock() { setLocked(true) }
```

A plain variable change is invisible to React's rendering system. Only `setState` calls trigger re-renders.

### State is isolated per component instance

If you render `<Building />` fifty times, each instance has its own independent state. They don't share state — each is its own world.

---

## 9. Refs: Mutable Values That Don't Re-render

`useRef` creates a mutable container — a box that holds a value. Unlike state, **changing a ref does not trigger a re-render**. The ref persists across renders: its value is stable and doesn't get recreated each time the component function runs.

```jsx
const isLocked = useRef(false)

// Reading:
if (isLocked.current) { ... }

// Writing — no re-render triggered:
isLocked.current = true
```

The value lives in `.current`. This is a deliberate design: the ref object itself is stable (the same object reference every render), but you mutate `.current` freely.

### Two uses of useRef

**1. Storing mutable values that shouldn't trigger re-renders:**

```jsx
const bobTime  = useRef(0)         // accumulated time for head bob
const moveDir  = useRef(new Vector3()) // reused movement vector
const isLocked = useRef(false)     // current lock state
```

These change every frame. If they were state, they'd trigger 60 re-renders per second, which would be catastrophically slow.

**2. Storing references to DOM elements or Three.js objects:**

```jsx
const gridRef = useRef()

// Attach to a JSX element:
<gridHelper ref={gridRef} args={[300, 60]} />

// After mount, gridRef.current is the actual Three.js GridHelper object:
useEffect(() => {
  gridRef.current.material.opacity = 0.18
}, [])
```

React populates `ref.current` with the underlying object after the component mounts, giving you an escape hatch to directly manipulate things outside React's control.

---

## 10. Effects: Synchronizing with the Outside World

`useEffect` runs code **after** a component renders, and optionally when specified values change. It's the bridge between React's declarative world and imperative side effects — setting up event listeners, directly mutating a DOM element, starting timers, etc.

```jsx
useEffect(() => {
  // This runs after the first render (and after re-renders if deps change)
  const mats = Array.isArray(gridRef.current.material)
    ? gridRef.current.material
    : [gridRef.current.material]

  mats.forEach(m => {
    m.transparent = true
    m.opacity = 0.18
  })
}, []) // empty dependency array = run once, on mount only
```

### The dependency array

The second argument to `useEffect` controls when it re-runs:

```jsx
useEffect(() => { ... })              // runs after EVERY render (dangerous, often wrong)
useEffect(() => { ... }, [])          // runs once, on mount
useEffect(() => { ... }, [value])     // runs when `value` changes
useEffect(() => { ... }, [a, b])      // runs when `a` OR `b` changes
```

### Cleanup

If your effect creates something that needs to be torn down (event listeners, subscriptions, timers), return a cleanup function:

```jsx
useEffect(() => {
  const onDown = (e) => { keys.current[e.code] = true  }
  window.addEventListener('keydown', onDown)

  return () => {
    // Runs when the component unmounts (or before the effect re-runs)
    window.removeEventListener('keydown', onDown)
  }
}, [])
```

Without cleanup, event listeners stack up every time the component mounts. In development, React intentionally mounts/unmounts components twice (in Strict Mode) to help you catch missing cleanups.

---

## 11. Custom Hooks: Reusable Stateful Logic

A **custom hook** is a function whose name starts with `use` and which calls other hooks inside it. It's the mechanism for extracting and sharing stateful logic between components.

```javascript
// src/hooks/useKeyboard.js
import { useEffect, useRef } from 'react'

export default function useKeyboard() {
  const keys = useRef({})

  useEffect(() => {
    const onDown = (e) => { keys.current[e.code] = true  }
    const onUp   = (e) => { keys.current[e.code] = false }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)

    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [])

  return keys
}
```

The `Player` component uses it like this:

```jsx
const keys = useKeyboard()
// keys is a ref: keys.current['KeyW'] is true while W is held
```

**Why extract it?** If you later add a second player, a menu system, or a debug overlay — any component that needs keyboard state just calls `useKeyboard()`. The logic is defined once.

**The "use" prefix matters.** React enforces rules about where hooks can be called (only at the top level of a component or another hook, never inside loops or conditions). The `use` prefix lets React's linter identify hook calls and enforce these rules.

---

## 12. React Three Fiber: The Reconciler

This is the most important concept in this document. Understanding it precisely will prevent a lot of confusion.

### What a React reconciler is

React is not just a DOM library. It is a **reconciliation algorithm** that can target any output — DOM nodes, native mobile views, PDF elements, or in our case: Three.js scene graph nodes. The reconciler is the core engine; the "renderer" is the plugin that connects it to a specific target.

- `react-dom` — reconciles React elements to the browser DOM
- `react-native` — reconciles to iOS/Android native views
- `@react-three/fiber` — reconciles to the Three.js scene graph

### What R3F does

R3F teaches React's reconciler to understand Three.js. When you write:

```jsx
<mesh position={[0, 3, -10]}>
  <boxGeometry args={[2, 2, 2]} />
  <meshLambertMaterial color="royalblue" />
</mesh>
```

R3F translates this into:

```javascript
const geometry = new THREE.BoxGeometry(2, 2, 2)
const material = new THREE.MeshLambertMaterial({ color: 'royalblue' })
const mesh = new THREE.Mesh(geometry, material)
mesh.position.set(0, 3, -10)
scene.add(mesh)
```

And when the component unmounts (e.g., you conditionally render `{isAlive && <Enemy />}` and `isAlive` becomes false):

```javascript
scene.remove(mesh)
geometry.dispose()
material.dispose()
```

R3F automatically handles both creation and cleanup. You never call `scene.add()` or `scene.remove()`. You never call `.dispose()`. The component tree IS the scene graph.

### The mapping rule

Every Three.js class is available in JSX as a **camelCase element**:

```
new THREE.Mesh(...)             →  <mesh>
new THREE.BoxGeometry(...)      →  <boxGeometry>
new THREE.MeshLambertMaterial() →  <meshLambertMaterial>
new THREE.DirectionalLight()    →  <directionalLight>
new THREE.FogExp2(...)          →  <fogExp2>
new THREE.GridHelper(...)       →  <gridHelper>
```

Constructor arguments go into the `args` prop as an array. All other properties go as regular props:

```jsx
// Three.js:
const light = new THREE.DirectionalLight(0xfff5e0, 1.1)
light.position.set(60, 90, 40)
light.castShadow = true

// R3F equivalent:
<directionalLight color="#fff5e0" intensity={1.1} position={[60, 90, 40]} castShadow />
```

---

## 13. The Canvas Component

```jsx
<Canvas
  shadows
  camera={{ fov: 75, near: 0.1, far: 500, position: [0, 1.7, 0] }}
  style={{ width: '100vw', height: '100vh', display: 'block' }}
>
  {/* your scene here */}
</Canvas>
```

`Canvas` is R3F's top-level component. It does several things:

1. **Creates the `<canvas>` HTML element** and appends it to the DOM
2. **Creates a WebGL renderer** (`THREE.WebGLRenderer`) configured with the props you pass
3. **Creates a default scene** (`THREE.Scene`)
4. **Creates a default camera** using the `camera` prop — if you pass `position`, `fov`, etc., it configures `THREE.PerspectiveCamera` accordingly
5. **Starts the render loop** — internally calls `requestAnimationFrame` and renders the scene each frame
6. **Creates a React context** that child components can access via hooks like `useThree()`

`shadows` is a shorthand for `shadows={THREE.PCFSoftShadowMap}` — it enables shadow maps on the renderer.

### What Canvas does NOT do

Canvas does not own the camera movement. It creates a camera, but how that camera moves is up to you (or Drei's control components). This separation is deliberate: the camera is just another thing in the scene that can be controlled by components.

---

## 14. R3F Primitive Naming: The Lowercase Convention

In JSX, a **capital letter** means a React component (a function you wrote or imported). A **lowercase letter** means a primitive element — either a DOM tag (`div`, `canvas`) or an R3F Three.js element (`mesh`, `boxGeometry`).

```jsx
<Building />    // capital B — calls the Building function component
<mesh />        // lowercase m — R3F creates a THREE.Mesh

<Player />      // capital P — calls Player()
<directionalLight />  // lowercase d — R3F creates a THREE.DirectionalLight
```

This convention is enforced by JSX's design. If you tried to write `<Mesh />`, React would look for a function called `Mesh` in scope. If you write `<mesh />`, R3F handles it as a Three.js primitive.

R3F knows about these lowercase names because it maintains a **catalogue** of all Three.js classes and registers them with the reconciler. It's not magic — it's a mapping from string names to Three.js class constructors.

---

## 15. The attach Prop

Some Three.js objects are not children of `scene` — they're properties of other objects. The `attach` prop tells R3F where to "attach" the element on its parent:

```jsx
<fogExp2 attach="fog" args={['#87CEEB', 0.018]} />
```

This is equivalent to:
```javascript
scene.fog = new THREE.FogExp2('#87CEEB', 0.018)
```

Without `attach="fog"`, R3F would try to call `scene.add(fog)`, which doesn't work — `THREE.FogExp2` is not an `Object3D`. It must be assigned to `scene.fog`. The `attach` prop handles this.

Another common case:

```jsx
<mesh>
  <boxGeometry attach="geometry" args={[2, 2, 2]} />
  <meshLambertMaterial attach="material" color="red" />
</mesh>
```

Actually, R3F is smart enough to infer these automatically based on the class type — if it's a `BufferGeometry`, it attaches to `.geometry`; if it's a `Material`, it attaches to `.material`. You only need to be explicit in ambiguous cases like `fog`.

---

## 16. useFrame: The R3F Game Loop

`useFrame` is the R3F hook that runs code every frame, inside the renderer's animation loop. This is where all frame-by-frame logic lives: movement, animation, physics updates.

```jsx
import { useFrame } from '@react-three/fiber'

useFrame((state, delta) => {
  // state: the R3F store — contains camera, scene, gl (renderer), clock, etc.
  // delta: seconds elapsed since the last frame (same as clock.getDelta())

  if (!isLocked.current) return   // early exit if not playing

  // Move the camera
  camera.translateZ(-speed * delta)
})
```

### How it works internally

R3F maintains a list of all `useFrame` callbacks registered across the component tree. After rendering the Three.js scene each frame, it iterates the list and calls each callback in order with `(state, delta)`. The delta value is computed by R3F's internal clock.

This means you never write `requestAnimationFrame` yourself. R3F owns the loop; you register callbacks into it.

### The order of frame callbacks

If multiple components register `useFrame`, they all run every frame. The order can matter (if component B reads a position that component A just wrote). R3F lets you control order with a priority argument:

```jsx
useFrame(() => { /* runs first */ }, 1)   // lower priority = earlier
useFrame(() => { /* runs later */ }, 2)
```

For simple projects, the default ordering (component tree order) is fine.

### `useFrame` vs `useEffect`

This distinction trips up many people:

- `useEffect` runs **after React renders** — it's for setup, teardown, and synchronization. Runs infrequently (on mount, when deps change).
- `useFrame` runs **every animation frame** — it's for continuous per-frame updates. Runs ~60 times per second.

Putting movement logic in `useEffect` would be wrong: it would only run once. Putting Three.js object setup in `useFrame` would be wrong: it would redo setup work 60 times per second.

---

## 17. useThree: Accessing the Three.js Context

`useThree` gives any component inside `<Canvas>` access to the underlying Three.js objects:

```jsx
import { useThree } from '@react-three/fiber'

function Player() {
  const { camera, scene, gl, size } = useThree()
  // camera: the active THREE.Camera
  // scene:  the THREE.Scene
  // gl:     the THREE.WebGLRenderer
  // size:   { width, height } of the canvas in pixels
}
```

This is how `Player.jsx` accesses the camera for direct manipulation:

```jsx
const { camera } = useThree()

useFrame((_, delta) => {
  camera.translateX(moveDir.current.x * speed * delta)
  camera.translateZ(moveDir.current.z * speed * delta)
})
```

`useThree` only works inside the Canvas — the context it reads from is provided by the `<Canvas>` component. Calling it in `App.jsx` (outside Canvas) would throw an error. This is why the LockBridge pattern (Section 22) is necessary.

### Subscribing to specific properties

You can pass a selector to `useThree` to avoid re-rendering when unrelated things change:

```jsx
const gl = useThree(state => state.gl)  // only re-renders if gl changes
```

This is an optimization. For most use cases, destructuring everything is fine.

---

## 18. Refs vs State in a Game Loop

This is one of the subtler but most important distinctions when building games with React.

### The rule

- **State** → use when a change should cause a re-render (UI update)
- **Ref** → use when a value changes every frame, or when updating it should NOT cause a re-render

### Why this matters for games

Suppose you used state for `isLocked`:

```jsx
// WRONG for game data
const [isLocked, setIsLocked] = useState(false)

useFrame(() => {
  if (!isLocked) return  // This reads isLocked from the render closure
  // ...
})
```

There's a subtle problem: `useFrame`'s callback is created once during render. The `isLocked` variable it references is the value at the time of that render (a **closure**). If `setIsLocked(true)` is called, a new render happens, a new `isLocked = true` exists — but the old `useFrame` callback still holds a reference to the old `isLocked = false`.

This is the **stale closure** problem. The fix: use a ref.

```jsx
// CORRECT for game data read inside useFrame
const isLocked = useRef(false)

const handleLock = () => {
  isLocked.current = true  // mutating the ref — no re-render
  onLock?.()               // call the prop callback to trigger parent re-render
}

useFrame(() => {
  if (!isLocked.current) return  // always reads the current value
  // ...
})
```

Refs are stable objects. `isLocked` always refers to the same object. `.current` is mutated in place. The `useFrame` callback always reads `.current` and always gets the latest value.

### The pattern for locked state in our game

```jsx
const isLocked = useRef(false)     // ref: for reading inside useFrame
// ...
// When locking changes, update the ref AND call the prop
// so the parent can update its own state (which re-renders the Overlay)
const handleLock   = () => { isLocked.current = true;  onLock?.()   }
const handleUnlock = () => { isLocked.current = false; onUnlock?.() }
```

The ref handles the per-frame check. The prop callback (`onLock`) propagates the change up to `App.jsx`, where `setLocked(true)` triggers a re-render that hides the Overlay. Both are needed for different reasons.

---

## 19. The useKeyboard Hook

Let's read the full hook and understand every line:

```javascript
import { useEffect, useRef } from 'react'

export default function useKeyboard() {
  // A ref holding a plain object used as a hash map: keyCode → boolean
  // Initialized empty — all keys start as "not pressed"
  const keys = useRef({})

  useEffect(() => {
    // These functions capture `keys` via closure
    const onDown = (e) => { keys.current[e.code] = true  }
    const onUp   = (e) => { keys.current[e.code] = false }

    // Register on the window, not the canvas — ensures we catch all key events
    // even if the canvas doesn't have focus
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)

    // Cleanup: remove listeners when the component unmounts
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, []) // [] = run once, on mount

  // Return the ref (not .current) so callers always have a stable reference
  // and can read .current inside useFrame without stale closure issues
  return keys
}
```

### Why return the ref, not the value?

If we returned `keys.current` (a plain object), the caller would get a snapshot of the object at render time. Mutations to `keys.current` after that render would not be visible through the reference the caller holds.

By returning `keys` (the ref object), the caller holds a stable reference to the container. `keys.current` always reads through to the live, mutable object.

### `e.code` vs `e.key`

`e.code` is the physical key identifier: `'KeyW'`, `'ShiftLeft'`, `'Space'`. It is independent of keyboard layout and modifier keys — the W key is always `'KeyW'` whether Shift is held or Caps Lock is on.

`e.key` is the character: `'w'`, `'W'`, `'ш'` (on a Cyrillic keyboard). This is wrong for game controls — you'd need separate cases for lowercase/uppercase, and the key would change on different keyboard layouts.

---

## 20. Drei: The Component Library

**Drei** (German for "three") is a collection of useful helpers, components, and hooks for React Three Fiber. Think of it as a standard library for R3F — things that every R3F project needs, implemented correctly once.

Install it with `npm install @react-three/drei`.

### Selected Drei offerings relevant to this project

**`<PointerLockControls />`** — first-person mouse look, covered in Section 21.

**`<Sky />`** — a procedural sky shader with sun position, sky color, and atmospheric scattering:
```jsx
<Sky sunPosition={[100, 10, 100]} />
```

**`useGLTF(url)`** — loads and caches a `.glb`/`.gltf` 3D model file:
```jsx
const { scene, animations } = useGLTF('/models/building.glb')
```

**`useAnimations(animations, ref)`** — wires a GLTF model's animation clips to an `AnimationMixer`:
```jsx
const { actions } = useAnimations(animations, ref)
actions['Walk'].play()
```

**`<Billboard />`** — a mesh that always faces the camera (for sprites, health bars, name labels):
```jsx
<Billboard>
  <planeGeometry args={[1, 1]} />
  <meshBasicMaterial map={spriteTexture} transparent />
</Billboard>
```

**`<Sparkles />`** — a particle system component:
```jsx
<Sparkles count={200} scale={4} size={2} speed={0.4} color="orange" />
```

**`<InstancedMesh>`** — render thousands of identical objects in one draw call:
```jsx
// 1000 trees, one draw call
<instancedMesh args={[geometry, material, 1000]} />
```

**`<Html />`** — embed DOM elements (including React UI) at a position in 3D space:
```jsx
<Html position={[0, 2, 0]}>
  <div className="name-label">Enemy Alpha</div>
</Html>
```

Drei is large and growing. Before writing any common 3D feature from scratch, check if Drei already has it.

---

## 21. PointerLockControls as a Component

In the vanilla `index.html`, pointer lock required about 30 lines of code:
- `requestPointerLock()` call
- `pointerlockchange` event listener
- `mousemove` handler with Euler math and quaternion conversion

In R3F with Drei, it's one line:

```jsx
<PointerLockControls onLock={handleLock} onUnlock={handleUnlock} />
```

### What it does internally

Drei's `PointerLockControls` wraps Three.js's own `THREE.PointerLockControls` class. When this component mounts:

1. It creates a `THREE.PointerLockControls` instance with the active camera
2. Registers all the pointer lock event listeners
3. Handles the Euler→Quaternion rotation math on every mouse move
4. Connects `onLock`/`onUnlock` to the underlying `lock`/`unlock` events

When it unmounts, it tears all of this down automatically. The component lifecycle handles the setup and cleanup that you'd otherwise write manually.

### Triggering the lock

`PointerLockControls` doesn't automatically lock when you click anywhere on the canvas. The browser requires you to explicitly call `requestPointerLock()` in a user gesture handler. Drei's component exposes a `lock()` method via ref:

```jsx
const controlsRef = useRef()
<PointerLockControls ref={controlsRef} />

// In a click handler:
controlsRef.current.lock()
```

Or, as we do in this project via the LockBridge: call `gl.domElement.requestPointerLock()` directly. `THREE.PointerLockControls` listens for `pointerlockchange` events on the document and connects automatically.

---

## 22. The LockBridge Pattern: Crossing the Canvas Boundary

This is one of the more architecturally interesting problems in the codebase. Let's understand it fully.

### The problem

We have two things that need to coordinate:
1. **`Overlay`** (outside Canvas) — a DOM `<div>` with a click handler. When clicked, it should trigger pointer lock.
2. **`Canvas`** (the WebGL surface) — the element that should have pointer lock requested on it.

`Overlay` needs to call `gl.domElement.requestPointerLock()`. But `gl` (the WebGL renderer) is only accessible via `useThree()`, which only works **inside** the Canvas tree. `Overlay` is outside the Canvas tree.

How do you get information from inside a Canvas to outside it?

### The solution: a bridge component

```jsx
// LockBridge lives inside Canvas (so it can use useThree)
// It surfaces a function to App (outside Canvas) via a callback
function LockBridge({ onReady }) {
  const { gl } = useThree()

  useEffect(() => {
    // Once mounted, call onReady with the lock function
    // App stores this function in a ref and calls it when needed
    onReady(() => gl.domElement.requestPointerLock())
  }, [gl, onReady])

  return null  // renders nothing — pure logic component
}
```

```jsx
// In App — the coordinator
const lockFn = useRef(null)

const handleReady = useCallback((fn) => {
  lockFn.current = fn  // store the lock function once the bridge is ready
}, [])

<Canvas>
  <LockBridge onReady={handleReady} />
  ...
</Canvas>

<Overlay onStart={() => lockFn.current?.()} />
```

### Why `useCallback` for `handleReady`?

`handleReady` is passed as a prop to `LockBridge`, which lists it in `useEffect`'s dependency array. If `handleReady` were defined as a plain arrow function in `App`'s render body, it would be a new function object on every render, causing `LockBridge`'s effect to re-run on every render. `useCallback` memoizes the function — it returns the same function reference as long as the dependencies don't change (empty `[]` means never).

### This pattern generalizes

Any time you need information from inside Canvas (a Three.js object, a computed value, a method) available outside Canvas, you use a bridge component. The bridge component:
1. Lives inside Canvas (so it has access to `useThree`, the R3F context)
2. Surfaces data/functions to the parent via callbacks or shared refs
3. Returns `null` — it's pure logic, no rendered output

---

## 23. Data-Driven Rendering: Arrays to JSX

One of React's most powerful patterns is mapping data arrays to JSX elements. This is how `Buildings.jsx` works:

```jsx
const BUILDINGS = [
  { pos: [-5, -10], dims: [3, 6, 3], color: '#8B6355' },
  { pos: [ 6,  -9], dims: [4, 4, 4], color: '#6B8E9F' },
  // ... 14 more
]

export default function Buildings() {
  return (
    <group>
      {BUILDINGS.map((b, i) => (
        <Building key={i} {...b} />
      ))}
    </group>
  )
}
```

`Array.map()` transforms an array of data objects into an array of React elements. React accepts arrays of elements as children — it renders each one.

### The `key` prop

`key` is a special React prop used to identify elements in a list. When the list changes (elements added, removed, reordered), React uses keys to determine what changed, minimizing DOM/scene updates.

Keys must be unique within the list. Using array index (`i`) is acceptable when the list never reorders. For dynamic lists (enemies that can die and be replaced), use a stable unique identifier from the data (e.g., `key={building.id}`).

If you omit `key`, React shows a warning and may produce incorrect behavior when the list changes.

### Why this approach scales

Adding a building is adding one object to the array. Removing a building is removing one object from the array. Loading buildings from a JSON file, a database, or a level editor export is just replacing the array — the rendering code is unchanged.

Compare to the vanilla approach:
```javascript
// Vanilla: each building is an imperative function call
box(-5, -10, 3, 6, 3, 0x8B6355)
box( 6,  -9, 4, 4, 4, 0x6B8E9F)
// ...
```

Here, the data and the imperative "do this" are fused together. You can't iterate over it, filter it, sort it, or load it from an external source without restructuring the code. The data-driven approach separates what to render from how to render it.

---

## 24. Component Decomposition and Scalability

Let's be explicit about why we decomposed the scene into separate files.

### The single-responsibility principle

Each component has one job:

| File | Responsibility |
|---|---|
| `App.jsx` | Wires everything together; owns lock state |
| `Player.jsx` | Camera movement + mouse look |
| `World.jsx` | Ground + grid |
| `Buildings.jsx` | All building geometry |
| `Trees.jsx` | All tree geometry |
| `Rocks.jsx` | All rock geometry |
| `Landmark.jsx` | The distant obelisk |
| `Overlay.jsx` | DOM start screen + HUD |
| `useKeyboard.js` | Keyboard state tracking |

If you need to change how trees look, you open `Trees.jsx`. You don't need to know anything about movement, lighting, or the overlay. This is called **locality of change** — changes are confined to the file responsible for that thing.

### How this scales to a larger game

Suppose you want to add enemies. You create:
- `src/components/Enemy.jsx` — one enemy (position, health, animation)
- `src/components/Enemies.jsx` — manages an array of enemies, spawns/despawns

In `App.jsx`, you add `<Enemies />`. Nothing else in the codebase changes.

Suppose you want a different level. You create:
- `src/levels/Level2.jsx` — different set of Buildings, Trees, Landmarks

And conditionally render `{currentLevel === 2 ? <Level2 /> : <Level1 />}`. The level geometry is now a swappable React subtree.

### Contrast with the vanilla version

In `index.html`, adding enemies would mean inserting imperative code into the single script block. After 500 lines, there's no natural place to put things. Finding "the building code" means scrolling or searching. Removing a feature means carefully excising code that's tangled with other code.

With component decomposition, the codebase is organized the same way a well-structured program is: each unit is findable, self-contained, and replaceable.

---

## 25. The group Component and Scene Organization

```jsx
<group name="buildings">
  {BUILDINGS.map(...)}
</group>
```

`<group>` maps to `new THREE.Group()` — a scene graph node with no geometry or material of its own. It exists purely to organize children.

### Why use group?

**Collective transforms:** Move/rotate/scale the group and all children move with it. To move a building cluster to a different part of the map, move the `<group>` — all buildings inside follow.

**Naming for debugging:** `name="buildings"` gives the group a label visible in Three.js's scene inspector tools. When you have a complex scene, named groups let you quickly find what you're looking for.

**Future animation:** If you want all the trees to sway together, apply a rotation to the `<group name="trees">` in `useFrame`. All trees inherit the animation.

**Conditional visibility:** `<group visible={false}>` hides all children at once, more efficiently than toggling each child individually.

### group in the vanilla version

In the vanilla code:
```javascript
scene.add(mesh1)
scene.add(mesh2)
// ...mesh1 and mesh2 have no explicit relationship
```

There's no grouping — every object is added directly to the scene root. This works for small scenes but makes collective operations (move all these objects, hide this category) tedious.

---

## 26. Shadow Props: R3F's Prop Piercing Syntax

Three.js objects often have nested properties: `light.shadow.mapSize.width`, `light.shadow.camera.near`. Setting these as JSX props uses **dash-separated piercing**:

```jsx
<directionalLight
  shadow-mapSize-width={2048}
  shadow-mapSize-height={2048}
  shadow-camera-near={1}
  shadow-camera-far={250}
  shadow-camera-left={-60}
  shadow-camera-right={60}
  shadow-camera-top={60}
  shadow-camera-bottom={-60}
/>
```

R3F splits each prop name at the dashes and traverses the object:
- `shadow-mapSize-width={2048}` → `light.shadow.mapSize.width = 2048`
- `shadow-camera-near={1}` → `light.shadow.camera.near = 1`

This is purely a prop naming convention — it's not CSS or HTML. The dashes tell R3F to drill down into nested properties.

### Why this exists

The alternative would be to use a ref and imperatively set properties in `useEffect`:

```jsx
const lightRef = useRef()
useEffect(() => {
  lightRef.current.shadow.mapSize.width = 2048
  // ...
}, [])
<directionalLight ref={lightRef} />
```

The dash syntax is more concise and keeps all configuration declarative in JSX. Both approaches work — the dash syntax is R3F's ergonomic shortcut.

---

## 27. Null-Rendering Components

`LockBridge` returns `null`:

```jsx
function LockBridge({ onReady }) {
  const { gl } = useThree()
  useEffect(() => { onReady(() => gl.domElement.requestPointerLock()) }, [gl, onReady])
  return null
}
```

A component that returns `null` renders nothing to the screen (or to the Three.js scene). It is pure logic, using hooks for side effects. This is a valid and useful React pattern.

Other examples of null-rendering components in game development:

```jsx
// A component that listens to a game event bus and updates state
function EventBusListener({ bus, onPlayerDied }) {
  useEffect(() => {
    bus.on('player:died', onPlayerDied)
    return () => bus.off('player:died', onPlayerDied)
  }, [bus, onPlayerDied])
  return null
}

// A component that runs a physics step every frame
function PhysicsWorld({ children }) {
  useFrame((_, delta) => { world.step(delta) })
  return <>{children}</>
}

// A component that preloads assets
function AssetPreloader({ urls }) {
  useEffect(() => { urls.forEach(url => useGLTF.preload(url)) }, [urls])
  return null
}
```

Components don't have to render UI to be useful. They encapsulate behavior and lifecycle as a React unit — meaning they follow all the same rules (mount/unmount, hooks, cleanup) as visual components.

---

## 28. The Full Mental Model: How It All Fits Together

Let's trace one complete cycle — the player presses W — through the entire stack.

**1. Input capture (event-driven)**
A `keydown` event fires on `window`. The listener registered in `useKeyboard`'s `useEffect` runs: `keys.current['KeyW'] = true`.

**2. Animation frame (the R3F loop)**
The browser's `requestAnimationFrame` fires. R3F's internal loop wakes up, computes `delta` from the clock, and calls `renderer.render(scene, camera)`. Then it calls all registered `useFrame` callbacks.

**3. Player movement (useFrame callback)**
`Player.jsx`'s `useFrame` callback runs:
- Reads `keys.current['KeyW']` → `true`
- `moveDir.current.set(0, 0, -1)` (forward)
- `moveDir.current.normalize()` (already length 1, no change)
- `camera.translateZ(-WALK_SPEED * delta)` — moves camera forward in its local space
- Head bob: `bobTime.current += delta * 7; camera.position.y = 1.7 + sin(bobTime) * 0.045`

**4. Three.js renders the updated camera**
The camera's world matrix has been updated (its position changed). When R3F calls `renderer.render(scene, camera)`, Three.js computes the view matrix from the new camera position, and all fragment positions on screen shift — the world appears to have moved forward.

**5. No React re-render occurred**
Critically: none of this triggered a React re-render. The camera is a Three.js object mutated directly in `useFrame`. React's reconciler was not involved. This is correct and efficient — per-frame game state should never flow through React's rendering system.

**6. ESC is pressed**
`PointerLockControls` fires `unlock`. Our `handleUnlock` callback runs:
- `isLocked.current = false` — future `useFrame` calls will early-exit
- `onUnlock?.()` — calls the prop, which is `() => setLocked(false)` in App

**7. React re-render occurs**
`setLocked(false)` triggers a React re-render of `App`. `App` re-renders with `locked = false`. `Overlay` re-renders, and because `locked` is now `false`, it renders the start screen div. React updates the DOM. The pause screen appears.

**8. The loop continues**
`useFrame` still fires every animation frame, but now `isLocked.current` is `false`, so the movement code returns immediately. The scene renders, but nothing moves.

### The key insight

There are two concurrent systems running simultaneously:
- **React's rendering system** — re-renders when state changes, updates the scene graph, handles UI
- **The animation loop** — fires 60 times/second, reads refs, mutates Three.js objects directly

They interact deliberately and sparingly. React handles discrete events (lock/unlock, health changes, inventory). The animation loop handles continuous, per-frame updates (position, head bob, particle movement). Understanding which system owns each piece of data is the central architectural skill of React Three Fiber development.

---

## Summary Table

| Concept | Where it lives | Why it exists |
|---|---|---|
| `package.json` | Project root | Declares dependencies; `npm install` reads it |
| `vite.config.js` | Project root | Configures Vite + JSX transform |
| `import`/`export` | Every file | Module system — each file has its own scope |
| `useState` | `App.jsx` | `locked` needs to trigger re-renders (show/hide Overlay) |
| `useRef` | `Player.jsx`, `World.jsx` | Per-frame data must not trigger re-renders |
| `useEffect` | `World.jsx`, `useKeyboard` | Setup/teardown of event listeners and imperative mutations |
| `useCallback` | `App.jsx` | Stabilizes `handleReady` so `LockBridge`'s effect doesn't re-run |
| `useFrame` | `Player.jsx` | Per-frame movement — the game loop hook |
| `useThree` | `Player.jsx`, `LockBridge` | Access camera, gl (renderer), scene from inside Canvas |
| `<Canvas>` | `App.jsx` | Creates WebGL context, scene, camera, starts render loop |
| `attach="fog"` | `App.jsx` | Assigns to `scene.fog` instead of calling `scene.add()` |
| `shadow-camera-near` | `App.jsx` | Piercing syntax for nested Three.js properties |
| `<group>` | `Buildings`, `Trees`, etc. | Organizes children; enables collective transforms |
| `key` prop | Every `.map()` | Helps React identify list elements during updates |
| `LockBridge` | `App.jsx` | Surfaces `gl.domElement` from inside Canvas to outside |
| `useKeyboard` | Custom hook | Reusable keyboard state — any component can use it |
| Data arrays + `.map()` | `Buildings`, `Trees`, `Rocks` | Separates data from rendering logic; easy to extend |
| Null-rendering components | `LockBridge` | Logic-only components — behavior without visual output |

---

*The vanilla `index.html` and this R3F version are the same game. Every pixel looks identical. What changed is the architecture: the code is now organized in a way that can grow. Each concept in this document is not a decoration — it is a tool that solves a specific scaling problem. When you understand why each tool exists, you'll know when to reach for it.*
