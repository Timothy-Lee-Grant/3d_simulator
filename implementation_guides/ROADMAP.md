# Implementation Roadmap

> A full analysis of the current project state and a comprehensive guide to every feature, system, and skill area to build next. Ordered by phase, not priority — each phase builds directly on the last. Every item describes what it teaches, not just what it does.

---

## Current State: Honest Audit

### What exists and works

| System | File | Status | Notes |
|---|---|---|---|
| Vite + React + R3F project | `package.json`, `vite.config.js` | ✅ Complete | npm install runs, dev server works |
| First-person camera | `Player.jsx` | ✅ Complete | WASD, mouse look, sprint, head bob |
| Pointer lock safety | `Player.jsx` | ✅ Complete | blur + visibilitychange auto-release |
| Ground + grid | `World.jsx` | ✅ Complete | 300×300 Lambert plane, semi-transparent grid |
| Shadow mapping | `App.jsx` | ✅ Complete | 2048px PCF soft, directional sun |
| Exponential fog | `App.jsx` | ✅ Complete | Matches sky color |
| Three-point lighting | `App.jsx` | ✅ Complete | Ambient + directional sun + hemisphere |
| Data-driven buildings | `Buildings.jsx` | ✅ Complete | 16 Lambert boxes, array-driven |
| Trees | `Trees.jsx` | ✅ Complete | Cylinder trunk + 2 sphere canopies, 8 instances |
| Rocks | `Rocks.jsx` | ✅ Complete | 5 sphere boulders |
| Distant landmark | `Landmark.jsx` | ✅ Complete | Obelisk at Z=-50 |
| Primitive human figure | `Human.jsx` | ✅ Complete | Named group skeleton, ~30 meshes |
| Start screen + HUD | `Overlay.jsx` | ✅ Complete | DOM overlay, crosshair, control hints |
| Keyboard state hook | `useKeyboard.js` | ✅ Complete | Ref-based, no re-render on key events |

### What is critically missing

| Gap | Impact |
|---|---|
| No collision detection | Player walks through every building, tree, and human |
| No physics / gravity | No jumping, no falling off edges |
| Flat Lambert materials | Everything looks like a colored plastic toy |
| No textures | No visual richness or surface detail |
| Static sky background | Just a CSS `background` color on the Canvas, not a rendered sky |
| Human figures frozen | Three people standing with zero animation |
| No audio | Complete silence — massive immersion killer |
| No interactivity | Cannot click, inspect, or interact with anything in the scene |
| No state management | No health, no inventory, no game logic |
| No level system | All scene objects hardcoded directly in `App.jsx` |
| ~~No post-processing~~ | ~~Flat, unfiltered render output~~ — **done: Bloom, SMAA, Vignette** |
| Separate draw calls per object | 30+ meshes in one human × 3 humans = ~90 draw calls just for NPCs |
| No LOD | Far objects render at same polygon count as nearby objects |
| No performance monitor | No way to know if frame rate is suffering |

---

## Phase 1 — Foundation Fixes
*These are not exciting features. They are the structural work that makes all future phases possible. Do these first.*

---

### 1.1 Collision Detection (AABB)

**What you'll learn:** Axis-Aligned Bounding Box (AABB) math, separating game logic from rendering, spatial reasoning in 3D.

**What's broken without it:** The player walks through every object in the scene. This destroys the sense of physical presence that makes a 3D world feel real.

**The concept:** An AABB is the simplest 3D collision shape — a box aligned with the world axes. You define it by two points: a minimum corner `(minX, minY, minZ)` and a maximum corner `(maxX, maxY, maxZ)`. Two AABBs are overlapping if and only if they overlap on all three axes simultaneously:

```
overlapping = (a.minX <= b.maxX && a.maxX >= b.minX) &&
              (a.minY <= b.maxY && a.maxY >= b.minY) &&
              (a.minZ <= b.maxZ && a.maxZ >= b.minZ)
```

**The player's AABB** is a capsule-like box around the camera: roughly 0.4 units wide, 1.8 units tall, centered on the camera position.

**Implementation plan:**
1. Create `src/systems/collision.js` — exports `checkAABB(playerBox, worldBoxes)`
2. Create `src/data/colliders.js` — exports an array of `{ min, max }` objects derived from BUILDINGS, TREES, etc.
3. In `Player.jsx`'s `useFrame`, compute the intended new position, run the collision check, and only apply the move if no collision is detected
4. For a smoother feel, implement **slide collision** — when the player collides, project their velocity onto the collision surface so they slide along walls instead of stopping dead

**Key files to create/modify:** `Player.jsx`, new `src/systems/collision.js`, new `src/data/colliders.js`

**Difficulty:** Medium. The math is simple; the tricky part is getting the player box dimensions right and handling edge cases (corners, thin walls).

---

### 1.2 Physics: Gravity and Jumping

**What you'll learn:** Numerical integration, velocity accumulation, the verlet integration method, ground detection.

**The concept:** Currently `Player.jsx` sets `camera.position.y = EYE_HEIGHT` every frame — hardcoded to ground level. Real physics works differently: the player has a vertical **velocity** that gravity accelerates downward each frame, and the ground cancels it when contact is made.

```
// Each frame:
velocityY -= 9.8 * delta           // gravity accelerates downward
camera.position.y += velocityY * delta  // integrate velocity into position

// Ground detection:
if (camera.position.y < EYE_HEIGHT) {
  camera.position.y = EYE_HEIGHT
  velocityY = 0
  isGrounded = true
}

// Jump (only when grounded):
if (keys['Space'] && isGrounded) {
  velocityY = 5.5    // launch velocity upward
  isGrounded = false
}
```

**What to add to `Player.jsx`:**
- `velocityY` ref (replaces fixed eye height)
- `isGrounded` ref
- Gravity constant
- Space key for jump
- Jump sound trigger (when audio is added)

**Difficulty:** Easy-Medium. The math is two lines; the challenge is tuning the feel (gravity strength, jump height, coyote time).

**Bonus: Coyote Time** — a classic game design trick. The player can still jump for ~100ms after walking off a ledge. It feels more responsive and forgiving. Implement with a `lastGroundedTime` ref.

---

### 1.3 A Proper Sky

**What you'll learn:** Shader-based procedural environments, the `Sky` component from Drei, atmosphere simulation.

**What's broken now:** The sky is the CSS `background` color on the `<Canvas>` element — a flat hex color, not a rendered sky. If the player looks straight up, they see nothing rendered, just the background. The fog also doesn't blend correctly at the horizon without a real sky shader.

**Implementation:**

```jsx
import { Sky } from '@react-three/drei'

// Inside Canvas, replace the background style:
<Sky
  sunPosition={[100, 20, 100]}
  turbidity={8}
  rayleigh={2}
  mieCoefficient={0.005}
  mieDirectionalG={0.8}
/>
```

The `Sky` component from Drei implements the **Preetham atmospheric scattering model** — a physically-based formula that computes sky color based on the sun's elevation, atmospheric turbidity (haze), and Rayleigh/Mie scattering parameters. The result is a gradient sky that's orange at the horizon during sunrise/sunset and deep blue at noon.

**Connect it to lighting:** The sun position in the `Sky` component should match the `directionalLight`'s position. When you later build a day/night cycle, you move both together.

**Difficulty:** Easy. Drei handles all the shader math.

---

### 1.4 Performance Stats Overlay

**What you'll learn:** The `Stats` component from Drei, understanding frame time budgets, identifying bottlenecks.

**Why it matters:** Before adding more features, you need a way to know if performance is degrading. Drei provides a one-line stats panel:

```jsx
import { Stats } from '@react-three/drei'
// Inside Canvas:
<Stats />
```

This shows FPS, frame time (ms), and memory usage in the top-left corner. You should add this now and keep it visible during development. Remove or hide it in a production build.

**What to watch for:**
- FPS should stay at 60 (or your monitor's refresh rate)
- Frame time should stay below 16.67ms (1000ms / 60fps)
- Memory should not continuously grow (a leak indicator)

**Difficulty:** Trivial. One import, one JSX tag.

---

## Phase 2 — Visual Richness
*Making the world look good. These skills are directly transferable to any 3D project.*

---

### 2.1 Textures and UV Mapping

**What you'll learn:** The texture pipeline, UV coordinates, texture tiling, normal maps, the difference between albedo/roughness/normal map roles.

**What changes:** `meshLambertMaterial` with a flat color → `meshStandardMaterial` with a texture map. This is the single biggest visual upgrade possible for this scene.

**The concept:** A texture is an image (PNG, JPG, WebP) mapped onto a mesh surface using UV coordinates — 2D coordinates (U, V) baked into each vertex that say "this vertex corresponds to this point on the texture image." The GPU samples the texture at each UV coordinate during rendering.

**Implementation plan:**
1. Create a `public/textures/` folder
2. Download or generate free textures (brick, concrete, grass, wood bark, stone) from sources like [Polyhaven](https://polyhaven.com/) — all CC0 licensed
3. Load with `useTexture` from Drei:

```jsx
import { useTexture } from '@react-three/drei'

function Building({ pos, dims, textureUrl }) {
  const texture = useTexture(textureUrl)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(dims[0] / 2, dims[1] / 2) // tile based on size

  return (
    <mesh position={[pos[0], dims[1]/2, pos[1]]} castShadow receiveShadow>
      <boxGeometry args={dims} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}
```

**Texture types to learn (in order of importance):**
- **Albedo/Color map** — the base color of the surface
- **Normal map** — encodes surface micro-detail as RGB colors that trick the lighting into thinking the surface has bumps and crevices (without adding geometry)
- **Roughness map** — black = mirror smooth, white = fully diffuse/matte
- **Ambient Occlusion (AO) map** — pre-baked shadow in surface crevices

**Full PBR material:**
```jsx
const [albedo, normal, roughness, ao] = useTexture([
  '/textures/brick/albedo.jpg',
  '/textures/brick/normal.jpg',
  '/textures/brick/roughness.jpg',
  '/textures/brick/ao.jpg',
])

<meshStandardMaterial
  map={albedo}
  normalMap={normal}
  roughnessMap={roughness}
  aoMap={ao}
/>
```

**Difficulty:** Medium. Loading is easy; understanding what each map does and how to tune them takes practice.

---

### 2.2 PBR Materials (MeshStandardMaterial)

**What you'll learn:** Physically Based Rendering (PBR), the metalness/roughness workflow, how real-time lighting models simulate physics.

**What changes:** Swapping `meshLambertMaterial` for `meshStandardMaterial` everywhere. Lambert shading is a simplified model (diffuse only). Standard/PBR shading adds specular highlights, fresnel effects, and metalness that Lambert cannot represent.

**Key properties:**
- `roughness` — 0 = mirror, 1 = chalk. Matte surfaces (stone, wood, concrete) are 0.7-0.9. Polished metal is 0.1-0.2.
- `metalness` — 0 = non-metal (plastic, stone, fabric), 1 = metal. Most real-world objects are 0.
- `envMap` — an environment map reflected in shiny surfaces. Required for metalness > 0 to look correct.

**Start with `<Environment>` from Drei:**

```jsx
import { Environment } from '@react-three/drei'
// Loads an HDR environment map and applies it to all PBR materials:
<Environment preset="sunset" />
// Presets: 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', etc.
```

**Difficulty:** Easy-Medium. Switching materials is straightforward; tuning to look good requires artistic judgment.

---

### 2.3 Human Animation: Procedural Idle

**What you'll learn:** Procedural animation using `useFrame` and math functions, the sine wave as an animation primitive, hierarchical transform inheritance.

**What it looks like:** The human figures gently breathe (torso slowly rises and falls), and their arms slightly sway. No external animation file needed — pure math.

**Implementation:** Add `useFrame` to `Human.jsx` with refs to the arm and torso groups:

```jsx
const torsoRef = useRef()
const armLeftRef = useRef()
const armRightRef = useRef()

useFrame(({ clock }) => {
  const t = clock.getElapsedTime()

  // Breathing — torso slowly rises and falls
  if (torsoRef.current) {
    torsoRef.current.position.y = Math.sin(t * 0.8) * 0.005
    torsoRef.current.scale.y = 1 + Math.sin(t * 0.8) * 0.008
  }

  // Arm sway — offset phases so they don't move in sync
  if (armLeftRef.current)  armLeftRef.current.rotation.x = Math.sin(t * 0.6) * 0.04
  if (armRightRef.current) armRightRef.current.rotation.x = Math.sin(t * 0.6 + Math.PI) * 0.04
})
```

**Key idea:** `clock.getElapsedTime()` gives absolute time since the scene started. Using `Math.sin(t * frequency) * amplitude` produces smooth oscillation. Different frequency/amplitude per body part, with different phase offsets (adding `Math.PI` to one arm flips it out of phase with the other), creates organic-looking movement from pure arithmetic.

**Difficulty:** Easy. The math is one line per body part. The art is in choosing the right frequencies and amplitudes.

---

### 2.4 Post-Processing Effects ✅

**What you'll learn:** The rendering pipeline after the scene is drawn, screen-space effects, the EffectComposer pattern.

**Package:** `npm install @react-three/postprocessing`

**What it is:** After the 3D scene is rendered to a texture, post-processing applies 2D image effects to that texture before it's displayed — like Instagram filters, but for 3D rendering.

**Implementation:**

```jsx
import { EffectComposer, Bloom, SSAO, Vignette, ChromaticAberration } from '@react-three/postprocessing'

// Inside Canvas:
<EffectComposer>
  <Bloom intensity={0.4} luminanceThreshold={0.8} luminanceSmoothing={0.9} />
  <Vignette eskil={false} offset={0.1} darkness={0.6} />
  <SSAO radius={0.4} intensity={20} luminanceInfluence={0.6} color="black" />
</EffectComposer>
```

**Effects to learn and add:**

| Effect | What it does | Difficulty |
|---|---|---|
| **Bloom** | Makes bright areas glow and bleed into surroundings | Easy |
| **Vignette** | Darkens the edges of the screen | Easy |
| **SSAO** | Screen-Space Ambient Occlusion — darkens crevices and corners in screen space | Easy to add, complex internals |
| **Depth of Field** | Blurs objects outside a focal range, like a camera lens | Medium |
| **Motion Blur** | Blurs fast-moving objects | Medium |
| **Chromatic Aberration** | Splits RGB channels slightly, like a cheap camera lens | Easy |
| **Film Grain** | Adds photographic noise | Easy |
| **Color Grading (LUT)** | Applies a color lookup table to remap all colors | Medium |
| **Outline** | Draws a colored outline around selected objects | Medium |

**Important:** Post-processing is expensive. Each effect is a full-screen texture pass. Use `Stats` to measure impact.

**Difficulty:** Easy to add; understanding the internals takes time.

---

### 2.5 Particle Systems

**What you'll learn:** GPU-driven particles using `THREE.Points` and `THREE.BufferGeometry`, custom shaders for particle appearance, instanced rendering at the particle level.

**Drei's `<Sparkles>` for a quick start:**
```jsx
import { Sparkles } from '@react-three/drei'
<Sparkles count={100} scale={3} size={1.5} speed={0.3} color="#ffee88" position={[0, 0, 0]} />
```

**Custom particle system for learning:**

A particle system is a single `THREE.Points` object with a `BufferGeometry` where each vertex is one particle. All particles are drawn in a single draw call — this is why particles can number in the thousands without destroying performance.

```jsx
function Dust({ count = 500 }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 40  // x
      arr[i * 3 + 1] = Math.random() * 8             // y
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40  // z
    }
    return arr
  }, [count])

  const pointsRef = useRef()
  useFrame(({ clock }) => {
    // Drift upward, wrap around
    const pos = pointsRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += 0.002
      if (pos[i * 3 + 1] > 8) pos[i * 3 + 1] = 0
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ffffcc" transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}
```

**What to build with particles:**
- Floating dust motes in sunbeams
- Rain (vertical falling points with streaks)
- Footstep dust when the player walks
- Torch/fire sparks
- Leaves blowing in wind

**Difficulty:** Medium. The data structure (BufferGeometry) is unfamiliar; understanding it is an important GPU skill.

---

## Phase 3 — Game Mechanics
*Where it becomes a game instead of a demo.*

---

### 3.1 Raycasting and Interaction

**What you'll learn:** Ray-object intersection, THREE.Raycaster, the concept of casting a ray from the camera center into the scene, interaction systems.

**What it enables:** Clicking on objects, picking up items, opening doors, inspecting NPCs, shooting.

**The concept:** A ray is a line starting at a point, going in a direction, extending infinitely. A raycast fires this ray into the scene and asks "what's the first object this ray hits?" The answer includes the hit object, the hit point in 3D space, the hit normal (surface direction), and the distance.

In a first-person game, the interaction ray fires from the center of the camera along the camera's forward direction — exactly where the crosshair points.

**Implementation using R3F's built-in raycasting:**

```jsx
// The onClick on any R3F mesh fires when that mesh is clicked
<mesh onClick={(event) => {
  event.stopPropagation()
  console.log('clicked mesh at', event.point)
  console.log('face normal:', event.face.normal)
}}>

// For continuous hover detection:
<mesh
  onPointerEnter={() => setHovered(true)}
  onPointerLeave={() => setHovered(false)}
/>
```

**R3F handles the raycasting automatically** — every pointer event on a mesh triggers a raycast from the camera through the click point.

**For interaction without clicking (proximity/look-at):**

```jsx
// In Player.jsx useFrame — fire a ray forward from the camera
const raycaster = new THREE.Raycaster()

useFrame(() => {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera)  // center of screen
  const hits = raycaster.intersectObjects(interactableObjects, true)
  if (hits.length > 0 && hits[0].distance < 3.0) {
    // Player is looking at something within 3 units — show interaction prompt
    setLookingAt(hits[0].object)
  }
})
```

**What to build with raycasting:**
- Inspect NPCs (show a name/dialogue when looking at them)
- Pick up collectible items
- Door opening (look at a door + press E)
- Shooting / weapon system
- Terrain height detection for slopes

**Difficulty:** Medium. The API is clear; the subtlety is object hierarchy (need `recursive: true` to hit child meshes) and performance (don't raycast against the entire scene every frame — maintain a list of interactable objects).

---

### 3.2 Game State Management with Zustand

**What you'll learn:** Global state management, the Zustand pattern, separating game logic from rendering, the store/subscriber model.

**Package:** `npm install zustand`

**Why not React state (useState)?** React state lives in a component. When that component unmounts, the state is gone. Game state (health, inventory, quest progress, player position for save/load) needs to live outside the component tree — in a store that any component can read from or write to, at any time.

**Creating a store:**

```javascript
// src/store/useGameStore.js
import { create } from 'zustand'

export const useGameStore = create((set, get) => ({
  // Player state
  health: 100,
  maxHealth: 100,
  stamina: 100,
  position: { x: 0, y: 1.7, z: 0 },

  // Inventory
  inventory: [],
  equippedItem: null,

  // World state
  discoveredAreas: [],
  interactedNPCs: [],

  // Actions
  takeDamage: (amount) => set(state => ({
    health: Math.max(0, state.health - amount)
  })),

  heal: (amount) => set(state => ({
    health: Math.min(state.maxHealth, state.health + amount)
  })),

  pickUpItem: (item) => set(state => ({
    inventory: [...state.inventory, item]
  })),

  savePosition: (pos) => set({ position: pos }),
}))
```

**Reading state anywhere:**
```jsx
// In any component, inside or outside Canvas:
const health = useGameStore(state => state.health)
const takeDamage = useGameStore(state => state.takeDamage)
```

**Difficulty:** Easy. Zustand's API is tiny — it's one of the simplest state libraries that exists.

---

### 3.3 HUD: Health Bar, Stamina Bar, Inventory

**What you'll learn:** Connecting 3D game state to 2D DOM UI, the pattern of reading the Zustand store in a DOM component, designing functional game UI.

**What to build in `Overlay.jsx`:**

```jsx
import { useGameStore } from '../store/useGameStore'

function HealthBar() {
  const health    = useGameStore(state => state.health)
  const maxHealth = useGameStore(state => state.maxHealth)
  const pct = (health / maxHealth) * 100

  return (
    <div style={styles.barContainer}>
      <div style={{ ...styles.bar, width: `${pct}%`, background: pct > 50 ? '#4caf50' : pct > 25 ? '#ff9800' : '#f44336' }} />
      <span style={styles.barLabel}>{health} / {maxHealth}</span>
    </div>
  )
}
```

**HUD elements to build:**
- Health bar (top-left)
- Stamina bar (depletes on sprint, regenerates when still)
- Interaction prompt ("Press E to talk" — appears when looking at an NPC)
- Minimap (covered separately in Phase 4)
- Inventory quick bar (bottom-center, shows equipped items)
- Compass (top-center, rotates with camera yaw)

**Difficulty:** Easy. It's React. The only new concept is reading from Zustand.

---

### 3.4 NPC Dialogue System

**What you'll learn:** State machines, dialogue trees, event-driven interactions, rendering DOM UI triggered by 3D world events.

**The concept:** When the player looks at a human and presses E, a dialogue panel appears. Dialogue is a tree — each NPC line has one or more response choices; choosing a response advances to the next line. This is a finite state machine: the state is "which line of dialogue are we on?"

**Data structure:**

```javascript
// src/data/dialogue.js
export const DIALOGUE = {
  npc_01: {
    greeting: {
      text: "Hey, traveller. Haven't seen you around here.",
      responses: [
        { label: "Who are you?",  next: 'identity'  },
        { label: "What is this place?", next: 'place' },
        { label: "Goodbye.",      next: null         },
      ]
    },
    identity: {
      text: "Just someone who got stuck here. Like everyone else.",
      responses: [
        { label: "Stuck how?",    next: 'stuck'     },
        { label: "Back to start", next: 'greeting'  },
      ]
    },
    // ...
  }
}
```

**State machine in the Overlay:**

```jsx
const [dialogueState, setDialogueState] = useState(null)
// dialogueState = { npcId: 'npc_01', nodeKey: 'greeting' }

// When E is pressed near an NPC:
setDialogueState({ npcId: 'npc_01', nodeKey: 'greeting' })

// Render:
const node = DIALOGUE[dialogueState.npcId][dialogueState.nodeKey]
```

**Difficulty:** Medium. Data structure design and state management are the challenges; rendering is just React.

---

### 3.5 Collectible Items and Inventory

**What you'll learn:** Entity systems, dynamic scene objects (items that appear/disappear), connecting 3D interaction to game state.

**What to build:**
1. `src/components/Item.jsx` — a 3D object (rotating glowing box/orb) that exists at a position in the world
2. `src/data/items.js` — item definitions (name, description, model, value)
3. `src/store/useWorldStore.js` — tracks which items have been picked up (so they don't reappear)

```jsx
function Item({ id, position, definition }) {
  const pickedUp = useWorldStore(state => state.pickedUpItems.includes(id))
  const pickUp   = useWorldStore(state => state.pickUpItem)

  useFrame(({ clock }) => {
    // Hover and rotate — classic collectible animation
    meshRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 2) * 0.1
    meshRef.current.rotation.y += 0.02
  })

  if (pickedUp) return null  // conditionally unmount when collected

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={() => pickUp(id)}
    >
      <octahedronGeometry args={[0.2]} />
      <meshStandardMaterial color="#ffdd00" emissive="#885500" emissiveIntensity={0.5} />
    </mesh>
  )
}
```

**Difficulty:** Medium. The pattern of "conditional render based on game state" is important and reusable.

---

## Phase 4 — World Building
*Making the world bigger, more varied, and more interesting.*

---

### 4.1 Level System: Loading Scenes from JSON

**What you'll learn:** Data-driven level design, JSON as a scene format, separating level data from rendering code, the groundwork for a level editor.

**The problem:** Every scene object is currently hardcoded in `App.jsx` or in individual component files. This makes adding content require code changes. A level system externalizes all this into data files.

**What a level file looks like:**

```json
// public/levels/level_01.json
{
  "name": "The Village",
  "spawnPoint": [0, 1.7, 0],
  "ambientLight": { "color": "#ffeedd", "intensity": 0.45 },
  "sun": { "position": [60, 90, 40], "color": "#fff5e0", "intensity": 1.1 },
  "fog": { "color": "#87CEEB", "density": 0.018 },
  "buildings": [
    { "id": "b_01", "pos": [-5, -10], "dims": [3, 6, 3], "color": "#8B6355", "texture": "brick" }
  ],
  "npcs": [
    { "id": "npc_01", "position": [0, 0, -5], "rotation": [0, 3.14, 0], "dialogueKey": "npc_01" }
  ],
  "items": [
    { "id": "item_01", "type": "key", "position": [3, 0.5, -8] }
  ],
  "triggers": [
    { "id": "area_01", "position": [0, 0, -20], "radius": 5, "event": "discover_fountain" }
  ]
}
```

**Implementation:**
1. Load the JSON with `fetch` in a `useEffect` or with Vite's built-in JSON import
2. Create a `<Level>` component that reads the JSON and renders the appropriate sub-components
3. Pass the level data down as props or put it in a Zustand store

**Difficulty:** Medium. Requires designing a good schema and building a generic `<Level>` renderer.

---

### 4.2 Procedural Terrain

**What you'll learn:** Heightmaps, Perlin/Simplex noise, `PlaneGeometry` vertex manipulation, terrain normal recalculation.

**The concept:** The current ground is a perfectly flat plane. Real terrain is generated by displacing the Y position of each vertex in a grid by a height value. A **heightmap** provides these values — either from an image (white = high, black = low) or from a noise function.

**Simplex noise for terrain:**

```javascript
import { createNoise2D } from 'simplex-noise'  // npm install simplex-noise

const noise2D = createNoise2D()

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(200, 200, 128, 128)
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position.array
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]
      // Multiple octaves of noise = large hills + small bumps
      positions[i + 1] =
        noise2D(x * 0.01, z * 0.01) * 8 +   // large hills
        noise2D(x * 0.05, z * 0.05) * 2 +   // medium undulations
        noise2D(x * 0.2,  z * 0.2)  * 0.5   // small surface bumps
    }

    geo.computeVertexNormals()  // recalculate normals after displacing vertices
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#4a7c45" wireframe={false} />
    </mesh>
  )
}
```

**What to build from terrain:**
- Hills and valleys to explore
- Rivers (low terrain filled with a water plane)
- Cliffs (steep terrain + collision)
- Caves (negative terrain + interior lighting)
- Biomes (different terrain colors/textures based on height)

**Difficulty:** Medium-Hard. The noise math is simple; making it look good and integrating it with collision is the challenge.

---

### 4.3 Day/Night Cycle

**What you'll learn:** Animating scene-level parameters over time, connecting multiple systems (sky position, light color/intensity, fog density, ambient color) to a single time value.

**Implementation:**

```jsx
function DayNightCycle() {
  const sunRef = useRef()
  const [time, setTime] = useState(0.3)  // 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk

  useFrame((_, delta) => {
    setTime(t => (t + delta * 0.01) % 1)  // one full day every ~100 real seconds
  })

  const angle = time * Math.PI * 2
  const sunX = Math.cos(angle) * 100
  const sunY = Math.sin(angle) * 100

  // At night, sun is below horizon (negative Y)
  const isDay = sunY > 0

  const sunColor = new THREE.Color().setHSL(
    time < 0.5 ? 0.08 : 0.08,  // orange at dawn/dusk
    isDay ? 0.6 : 0,
    isDay ? Math.max(0.1, sunY / 100) : 0.05
  )

  return (
    <>
      <Sky sunPosition={[sunX, sunY, 100]} />
      <directionalLight
        ref={sunRef}
        color={sunColor}
        intensity={isDay ? Math.max(0, sunY / 100) * 1.5 : 0}
        position={[sunX, sunY, 100]}
        castShadow
      />
      <ambientLight intensity={isDay ? 0.3 : 0.05} color={isDay ? "#ffeedd" : "#112244"} />
    </>
  )
}
```

**What makes this interesting:** It forces you to think about all the systems that depend on time-of-day: lighting, sky, fog color, NPC behavior (sleep/wake), visibility range, atmosphere.

**Difficulty:** Medium. Connecting all systems to one time value is straightforward; making it look beautiful requires artistic tuning.

---

### 4.4 Water

**What you'll learn:** Animated shader materials, texture scrolling, reflection/refraction approximation, alpha transparency in 3D.

**Simple water using texture scrolling:**

```jsx
function Water({ position, size }) {
  const waterRef = useRef()
  const texture = useTexture('/textures/water_normal.jpg')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    // Scroll the texture over time to simulate water movement
    texture.offset.set(t * 0.05, t * 0.03)
    waterRef.current.material.opacity = 0.75 + Math.sin(t) * 0.05
  })

  return (
    <mesh ref={waterRef} rotation={[-Math.PI/2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={texture}
        color="#1a4a7a"
        transparent
        opacity={0.8}
        roughness={0.1}
        metalness={0.1}
      />
    </mesh>
  )
}
```

**Advanced water (for later):** Drei's `<MeshReflectorMaterial>` gives you real-time reflections on a plane with one component.

**Difficulty:** Easy (texture scroll) to Hard (real shader-based water).

---

## Phase 5 — Audio
*Often the most neglected system. Sound has more impact on immersion than any visual effect.*

---

### 5.1 Spatial Audio with the Web Audio API

**What you'll learn:** The Web Audio API, the AudioContext, spatial audio (sound that comes from 3D positions), PannerNode for 3D positioning.

**Package:** `npm install @react-three/drei` already includes `useAudio` and `<PositionalAudio>`.

**Ambient sound:**
```jsx
import { useAudio } from '@react-three/drei'

function Ambience() {
  const sound = useAudio('/audio/wind.mp3', { loop: true, volume: 0.3 })
  useEffect(() => { sound.play() }, [])
  return null
}
```

**Positional audio (sound has a 3D location):**
```jsx
import { PositionalAudio } from '@react-three/drei'

// Fire crackling from a campfire position:
<mesh position={[5, 0.5, -10]}>
  <sphereGeometry args={[0.2]} />
  <meshBasicMaterial color="orange" />
  <PositionalAudio url="/audio/fire.mp3" distance={5} loop />
</mesh>
```

The browser's Web Audio API uses a `PannerNode` with HRTF (Head-Related Transfer Function) — a model of how sound reaches each ear differently depending on the sound's direction. The result is that you can actually hear which direction sound is coming from, even with headphones.

**Sounds to add:**
- Footstep sounds (triggered in Player.jsx's movement code)
- Wind ambience (looping, global)
- NPC ambient sounds (breathing, murmuring — positional, from NPC position)
- Interaction sounds (picking up items, opening doors)
- Background music

**Difficulty:** Easy with Drei abstractions. Hard if writing raw Web Audio API.

---

### 5.2 Footstep System

**What you'll learn:** Connecting animation systems to audio, detecting surface type, timing audio to movement cycles.

**The concept:** Play a footstep sound twice per head bob cycle — once as the bob reaches its lowest point on each side. This syncs audio to the visual rhythm of walking.

```jsx
// In Player.jsx useFrame:
const prevBobY = useRef(0)
const leftStep = useRef(true)

// Detect the bottom of each bob swing:
const bobY = Math.sin(bobTime.current) * BOB_AMPLITUDE
const crossedBottom = prevBobY.current > bobY  // falling
const atBottom = bobY < -BOB_AMPLITUDE * 0.8

if (crossedBottom && atBottom && moving) {
  playFootstep(leftStep.current ? 'left' : 'right')
  leftStep.current = !leftStep.current
}
prevBobY.current = bobY
```

**Surface-aware footsteps:** Raycast straight down from the player, check what object is hit, and choose the footstep sound bank accordingly (grass vs stone vs wood vs water).

**Difficulty:** Medium.

---

## Phase 6 — Advanced Rendering
*The deep end of real-time graphics.*

---

### 6.1 GLTF Model Loading

**What you'll learn:** The GLTF format, scene graph import, working with external artist-created assets, `useGLTF` and `useAnimations` from Drei.

**GLTF** (GL Transmission Format) is the standard format for real-time 3D models — every 3D tool (Blender, Maya, Substance Painter) exports it. A `.glb` file is a binary GLTF, including geometry, materials, textures, and animations in a single file.

**Loading a model:**
```jsx
import { useGLTF } from '@react-three/drei'

function Tree({ position }) {
  const { scene } = useGLTF('/models/tree.glb')
  return <primitive object={scene.clone()} position={position} />
}

// Preload so it's ready before the scene renders:
useGLTF.preload('/models/tree.glb')
```

**Loading a model with animations:**
```jsx
import { useGLTF, useAnimations } from '@react-three/drei'

function Character({ position, animationName }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/character.glb')
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions[animationName]?.reset().fadeIn(0.3).play()
    return () => actions[animationName]?.fadeOut(0.3)
  }, [animationName, actions])

  return <primitive ref={group} object={scene} position={position} />
}
```

**Free model sources:**
- [Quaternius](https://quaternius.com/) — CC0 low-poly packs
- [Sketchfab](https://sketchfab.com/features/free-3d-models) — filter by license
- [KhronosGroup GLTF samples](https://github.com/KhronosGroup/glTF-Sample-Assets)

**Difficulty:** Easy to load, medium to animate correctly, hard to optimize for many instances.

---

### 6.2 Skeletal Animation

**What you'll learn:** Bone hierarchies, animation clips, the AnimationMixer, animation blending and transitions, root motion.

**Key concepts:**
- A **skeleton** is a hierarchy of bones (transform nodes, no geometry)
- **Skin weights** determine how much each vertex is influenced by each nearby bone
- An **animation clip** is a timeline of bone transform keyframes
- The **AnimationMixer** plays clips and blends between them

**Animation state machine:**

```javascript
// States: idle, walk, run, jump
// Transitions: idle→walk when moving, walk→run on sprint, etc.

const STATES = { IDLE: 'idle', WALK: 'walk', RUN: 'run', JUMP: 'jump' }

useFrame(() => {
  const currentState = getState(keys, isGrounded)

  if (currentState !== prevState.current) {
    // Crossfade between animations:
    actions[prevState.current]?.fadeOut(0.2)
    actions[currentState]?.reset().fadeIn(0.2).play()
    prevState.current = currentState
  }
})
```

**Difficulty:** Hard. This is one of the most complex systems in real-time games. Blender + Mixamo for animation source material is recommended.

---

### 6.3 Instanced Rendering

**What you'll learn:** `THREE.InstancedMesh`, the instance matrix, GPU instancing, the performance difference between 1 draw call and N draw calls.

**The problem:** Each `<Human />` currently causes ~30 draw calls (one per mesh). Three humans = 90 draw calls. A crowd of 100 humans = 3,000 draw calls. This will tank performance.

**The solution:** `InstancedMesh` draws N copies of the same geometry+material in a single draw call, using a matrix per instance to position/rotate/scale each one.

```jsx
function Crowd({ count = 100 }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 60,
        0,
        -(Math.random() * 60)
      )
      dummy.rotation.y = Math.random() * Math.PI * 2
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [count])

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[0.5, 1.7, 0.5]} />  {/* simplified stand-in geometry */}
      <meshLambertMaterial color="#888888" />
    </instancedMesh>
  )
}
```

**The limitation:** All instances share the same material. Per-instance color requires using `setColorAt`. Per-instance animation requires custom shader work.

**Difficulty:** Medium. The concept is simple; understanding the matrix math and update cycle takes effort.

---

### 6.4 Custom Shaders in GLSL

**What you'll learn:** GLSL (OpenGL Shading Language), writing vertex and fragment shaders from scratch, uniforms, varyings, the full GPU pipeline.

**Why write custom shaders:** Pre-built materials (Lambert, Standard) handle the common cases. For unique visual effects — lava, force fields, holographic displays, cel shading, water surfaces, grass that bends in wind — you write your own shader.

**A custom shader material in R3F:**

```jsx
function GlowingOrb() {
  const materialRef = useRef()

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <mesh>
      <sphereGeometry args={[0.5, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            // Fresnel effect — bright at edges, dark in center
            float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            // Pulsing
            float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
            vec3 color = mix(vec3(0.1, 0.3, 1.0), vec3(0.5, 0.8, 1.0), fresnel * pulse);
            gl_FragColor = vec4(color, fresnel + 0.1);
          }
        `}
        transparent
      />
    </mesh>
  )
}
```

**Shader projects to build:**
- Fresnel/rim lighting on NPCs
- Animated lava floor (scrolling noise in vertex/fragment shader)
- Cel shading (discretized diffuse bands)
- Grass vertex shader (vertices wave in sine-based wind)
- Force field (animated hexagonal grid pattern)
- Portal effect (distortion + color swirl)

**Difficulty:** Hard. GLSL is a different language with different debugging tools. But it's the most powerful skill in real-time graphics.

---

## Phase 7 — Polish and Systems Depth
*The difference between a tech demo and a game.*

---

### 7.1 Minimap

**What you'll learn:** Rendering the scene from a second camera, render targets, off-screen rendering.

**The concept:** A minimap renders the scene from a top-down orthographic camera onto a texture, then displays that texture as a 2D DOM element in the HUD.

```jsx
// A second camera looking straight down
const minimapCamera = new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 100)
minimapCamera.position.set(0, 50, 0)
minimapCamera.lookAt(0, 0, 0)

// A render target — an off-screen framebuffer
const renderTarget = new THREE.WebGLRenderTarget(256, 256)

useFrame(({ gl, scene }) => {
  gl.setRenderTarget(renderTarget)
  gl.render(scene, minimapCamera)
  gl.setRenderTarget(null)  // restore normal render target
})

// Display in HUD using a canvas that reads the texture
```

**Difficulty:** Hard. Render targets and second cameras require understanding the rendering pipeline.

---

### 7.2 Save / Load System

**What you'll learn:** Browser persistence with `localStorage`, serializing and deserializing game state, save file versioning.

**What to save:**
- Player position and camera rotation
- Inventory contents
- Picked-up items (so they don't respawn)
- Discovered areas
- NPC dialogue progress

```javascript
// src/systems/saveLoad.js
export function saveGame(store) {
  const saveData = {
    version: 1,
    timestamp: Date.now(),
    player: {
      position: store.position,
      health: store.health,
    },
    world: {
      pickedUpItems: store.pickedUpItems,
      discoveredAreas: store.discoveredAreas,
    }
  }
  localStorage.setItem('save_slot_1', JSON.stringify(saveData))
}

export function loadGame() {
  const raw = localStorage.getItem('save_slot_1')
  if (!raw) return null
  const data = JSON.parse(raw)
  if (data.version !== 1) return null  // handle version mismatch
  return data
}
```

**Difficulty:** Easy. `localStorage` and JSON.stringify/parse is all you need.

---

### 7.3 LOD (Level of Detail)

**What you'll learn:** The LOD system, performance optimization, the triangle budget problem, distance-based rendering decisions.

**The concept:** Objects far away from the camera don't need high polygon counts — the detail is imperceptible at distance. LOD systems swap between high, medium, and low polygon versions of a mesh based on camera distance.

Drei's `<Detailed>` component:

```jsx
import { Detailed } from '@react-three/drei'

function Tree({ position }) {
  return (
    <Detailed distances={[0, 15, 40]}>
      {/* High detail — close up */}
      <HighPolyTree position={position} />
      {/* Medium detail — mid distance */}
      <MedPolyTree position={position} />
      {/* Billboard — just a sprite at far distance */}
      <TreeSprite position={position} />
    </Detailed>
  )
}
```

The furthest LOD for a tree is typically just a **billboard** — a flat plane with a PNG texture of a tree that always faces the camera. You can have hundreds of distant trees with almost zero GPU cost this way.

**Difficulty:** Medium.

---

### 7.4 Debug Tools

**What you'll learn:** Runtime debugging in 3D, Leva (a debug control panel), displaying collision boxes, visualizing raycasts.

**Package:** `npm install leva`

```jsx
import { useControls } from 'leva'

function Player() {
  const { walkSpeed, sprintSpeed, fov } = useControls('Player', {
    walkSpeed:   { value: 7,    min: 1,  max: 20, step: 0.5 },
    sprintSpeed: { value: 14,   min: 5,  max: 30, step: 0.5 },
    fov:         { value: 75,   min: 40, max: 120, step: 1   },
  })

  // Use these values instead of the constants
}
```

Leva creates a floating control panel in the browser where you can tweak values in real time and see the result immediately. This is how professionals tune game feel — not by editing code, saving, and reloading.

**Other debug tools to add:**
- `<axesHelper>` — shows XYZ axes as RGB lines at the origin
- `<gridHelper>` — already in the project
- `<boxHelper>` — draws a wireframe box around an object's AABB
- `<arrowHelper>` — visualizes a direction vector (useful for debugging raycasts)

**Difficulty:** Easy. Leva's API is simple.

---

## Feature Priority Matrix

| Feature | Impact | Complexity | Teaches |
|---|---|---|---|
| Collision detection | 🔴 Critical | Medium | Spatial math, game loop integration |
| Jumping + gravity | 🔴 Critical | Easy | Physics integration |
| Textures + PBR | 🟠 High | Medium | Full rendering pipeline |
| Proper sky shader | 🟠 High | Easy | Atmospheric rendering |
| Stats overlay | 🟠 High | Trivial | Performance awareness |
| Human animation (idle) | 🟡 Medium | Easy | Procedural animation, sine waves |
| Post-processing | 🟡 Medium | Easy | Screen-space effects |
| Audio + footsteps | 🟡 Medium | Medium | Web Audio, spatial sound |
| Zustand state store | 🟡 Medium | Easy | Global state architecture |
| HUD (health, stamina) | 🟡 Medium | Easy | Connecting 3D logic to 2D UI |
| Raycasting + interaction | 🟡 Medium | Medium | Ray-object intersection |
| Particle systems | 🟢 Enhancement | Medium | GPU buffers, instanced geometry |
| Procedural terrain | 🟢 Enhancement | Medium | Noise, vertex manipulation |
| Day/night cycle | 🟢 Enhancement | Medium | Multi-system animation |
| Level JSON system | 🟢 Enhancement | Medium | Data-driven architecture |
| Instanced rendering | 🟢 Enhancement | Medium | GPU instancing, draw call batching |
| GLTF model loading | 🟢 Enhancement | Easy | Asset pipeline |
| Skeletal animation | 🟢 Enhancement | Hard | Bone hierarchies, AnimationMixer |
| Custom GLSL shaders | 🟢 Enhancement | Hard | GPU programming |
| Minimap | 🟢 Enhancement | Hard | Render targets |
| Dialogue system | 🟢 Enhancement | Medium | State machines |
| Collectible items | 🟢 Enhancement | Medium | Entity systems |
| Save / load | 🟢 Enhancement | Easy | Browser persistence |
| LOD system | 🟢 Enhancement | Medium | Performance optimization |
| Water | 🟢 Enhancement | Medium | Animated materials |
| Debug tools (Leva) | 🟢 Enhancement | Easy | Development workflow |

---

## Suggested Build Order

```
Phase 1 (Do Now)
  ├── 1.4 Stats overlay          ← one line, enables informed decisions
  ├── 1.3 Proper sky shader      ← huge visual win, trivial to add
  ├── 1.1 Collision detection    ← makes it feel like a real space
  └── 1.2 Jumping + gravity      ← makes movement feel complete

Phase 2 (Visual Richness)
  ├── 2.2 PBR materials          ← upgrade all Lambert → Standard
  ├── 2.1 Textures               ← brick, concrete, grass, bark
  ├── 2.3 Human idle animation   ← breathing + arm sway
  └── 2.4 Post-processing        ← bloom + vignette minimum

Phase 3 (Game Mechanics)
  ├── 3.2 Zustand state store    ← prerequisite for everything else
  ├── 3.3 HUD (health, stamina)  ← connect state to UI
  ├── 3.1 Raycasting             ← enables all interaction
  ├── 3.4 NPC dialogue           ← first real game interaction
  └── 3.5 Collectible items      ← closes the loop on interaction

Phase 4 (World Building)
  ├── 4.1 Level JSON system      ← move content out of code
  ├── 4.2 Procedural terrain     ← interesting world to walk through
  ├── 4.3 Day/night cycle        ← live world feeling
  └── 4.4 Water                  ← visual landmark

Phase 5 (Audio)
  ├── 5.1 Spatial audio          ← world-class immersion boost
  └── 5.2 Footstep system        ← grounds the player in the space

Phase 6 (Advanced Rendering)
  ├── 6.1 GLTF model loading     ← real assets
  ├── 6.3 Instanced rendering    ← performance at scale
  ├── 6.2 Skeletal animation     ← living characters
  └── 6.4 Custom GLSL shaders    ← unique visual effects

Phase 7 (Polish)
  ├── 7.4 Debug tools (Leva)     ← better development workflow
  ├── 7.3 LOD system             ← scalable world
  ├── 7.2 Save / load            ← persistent world
  └── 7.1 Minimap                ← navigation
```

---

## File Structure at Full Build-Out

```
src/
├── main.jsx
├── App.jsx
├── index.css
│
├── components/
│   ├── Player.jsx            ← movement, jump, collision response
│   ├── World.jsx             ← terrain, ground, grid
│   ├── Sky.jsx               ← sky shader + day/night
│   ├── Water.jsx             ← animated water plane
│   ├── Buildings.jsx         ← box structures
│   ├── Trees.jsx             ← LOD trees
│   ├── Rocks.jsx             ← boulders
│   ├── Landmark.jsx          ← obelisk
│   ├── Human.jsx             ← primitive humanoid (or GLTF)
│   ├── NPC.jsx               ← Human + dialogue trigger + animation state
│   ├── Item.jsx              ← collectible item entity
│   ├── Particles.jsx         ← dust, weather, effects
│   ├── PostProcessing.jsx    ← EffectComposer setup
│   └── Overlay.jsx           ← all DOM UI
│
├── hooks/
│   ├── useKeyboard.js        ← key state
│   ├── useMouseDelta.js      ← raw mouse delta (for custom controls)
│   ├── useRaycast.js         ← forward raycast hook
│   └── useAudio.js           ← audio management hook
│
├── systems/
│   ├── collision.js          ← AABB collision detection
│   ├── physics.js            ← gravity, velocity integration
│   ├── saveLoad.js           ← localStorage save/load
│   └── lod.js                ← LOD management utilities
│
├── store/
│   ├── useGameStore.js       ← player state (health, stamina, inventory)
│   └── useWorldStore.js      ← world state (picked up items, discovered areas)
│
├── data/
│   ├── colliders.js          ← AABB boxes for all static geometry
│   ├── items.js              ← item definitions
│   ├── dialogue.js           ← NPC dialogue trees
│   └── npcs.js               ← NPC definitions
│
├── shaders/
│   ├── fresnel.glsl          ← rim lighting
│   ├── water.glsl            ← animated water surface
│   └── grass.glsl            ← wind-blown grass
│
└── levels/
    └── (loaded from public/levels/*.json)

public/
├── textures/
│   ├── brick/
│   │   ├── albedo.jpg
│   │   ├── normal.jpg
│   │   └── roughness.jpg
│   ├── concrete/
│   ├── grass/
│   └── water_normal.jpg
├── models/
│   ├── tree.glb
│   └── character.glb
├── audio/
│   ├── footstep_grass_01.mp3
│   ├── footstep_stone_01.mp3
│   └── wind_ambience.mp3
└── levels/
    └── level_01.json
```

---

*Every feature in this roadmap is a real skill used in production games. This project, built fully, would cover collision systems, physics integration, PBR rendering, texture pipelines, procedural generation, skeletal animation, spatial audio, shader programming, state management, and GPU optimization. That is a comprehensive real-time 3D graphics education.*
