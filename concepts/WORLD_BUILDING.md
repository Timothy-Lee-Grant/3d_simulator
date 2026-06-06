# Phase 4 — World Building: A Complete Engineering Lecture

> **Who this is for:** Junior software engineers who have followed the project through Phases 1–3. You understand React, JSX, and the basics of Three.js/R3F. This document teaches you *why* the Phase 4 systems were designed the way they were, not just *what* they do. Read this alongside the source files — they are the living version of everything explained here.

---

## Table of Contents

1. [The Problem Phase 4 Solves](#1-the-problem-phase-4-solves)
2. [Phase 4.1 — Data-Driven Level Design](#2-phase-41--data-driven-level-design)
3. [Phase 4.2 — Procedural Terrain](#3-phase-42--procedural-terrain)
4. [Phase 4.3 — Day/Night Cycle](#4-phase-43--daynight-cycle)
5. [Phase 4.4 — Water](#5-phase-44--water)
6. [The Architecture Lesson: One Pattern, Four Applications](#6-the-architecture-lesson-one-pattern-four-applications)
7. [Exercises](#7-exercises)

---

## 1. The Problem Phase 4 Solves

Before Phase 4, the world had three problems:

**It was flat and featureless.** A 300×300 unit plane with zero elevation. Walking felt like moving across a table. There were no landmarks created by the land itself — just buildings and trees placed on a billiard table.

**The sky was dead.** A static `Sky` component whose sun never moved. The `ambientLight` and `directionalLight` never changed. The game had no sense of time passing. A world where the sun is frozen at 10am forever does not feel inhabited.

**Content was locked in code.** Three NPCs, hardcoded in `App.jsx` as `<NPC npcId="npc_01" .../>`. Adding a fourth NPC required opening a source file, adding a JSX tag, saving, and reloading the dev server. In a real game, level designers are not developers — they need to edit content without touching source code.

Phase 4 addresses all three. By the end, you will understand terrain generation, animated materials, real-time lighting systems, and data-driven architecture — all concepts that appear in production games and graphical applications.

---

## 2. Phase 4.1 — Data-Driven Level Design

### Files: `src/components/Level.jsx`, `public/levels/level_01.json`

### The Core Problem: Content Coupled to Code

When you hardcode content in JSX, you make a mistake that scales badly:

```jsx
// Before — hardcoded in App.jsx
<NPC npcId="npc_01" name="The Stranger"   position={[0,   0, -5]} rotation={[0, 3.14, 0]} phaseOffset={0.0} />
<NPC npcId="npc_02" name="The Wanderer"   position={[2.5, 0, -7]} rotation={[0, 4.08, 0]} phaseOffset={2.1} />
<NPC npcId="npc_03" name="The Gatekeeper" position={[-2,  0, -6]} rotation={[0, 2.51, 0]} phaseOffset={4.7} />
```

Adding a fourth NPC requires: open `App.jsx`, add a line, save, wait for hot-reload. Now imagine a game with 400 NPCs across 20 levels. The source files become enormous tables of coordinates. Non-developers can't contribute. Bugs get introduced. The content and the code are fused into one unseparable mass.

The solution is **data-driven architecture**: describe content in a data format (JSON) and write generic code that renders anything described by that format.

### The Solution: JSON as a Scene Format

```json
{
  "npcs": [
    {
      "id": "npc_01",
      "name": "The Stranger",
      "position": [0, 0, -5],
      "rotation": [0, 3.14159, 0],
      "phaseOffset": 0.0
    }
  ],
  "triggers": [
    {
      "id": "area_lake",
      "label": "The Lake",
      "position": [-35, 0, -45],
      "radius": 20,
      "event": "discover_area"
    }
  ]
}
```

The JSON file is a **schema** — a structured description of what should exist in the world. The code becomes **infrastructure** — a generic system that can render any level described by this schema.

Now to add a fourth NPC, you edit the JSON file. No code change. A designer without React knowledge can do this.

### How Vite Loads JSON

In this project, the JSON is imported as a static module:

```javascript
import levelData from '../../public/levels/level_01.json'
```

Vite (the build tool) handles JSON imports natively. At build time, it reads the file, parses it into a JavaScript object, and bundles that object into the JavaScript module. At runtime, `levelData` is already a plain JS object — no `fetch`, no async, no loading spinner needed.

For larger games where levels are loaded on-demand, you would use `fetch`:

```javascript
useEffect(() => {
  fetch('/levels/level_02.json')
    .then(r => r.json())
    .then(setLevelData)
}, [levelId])
```

The JSON lives in `public/` (not `src/`) because Vite serves everything in `public/` at the root URL without processing it. `public/levels/level_01.json` is available at `http://localhost:5173/levels/level_01.json` in development.

### Rendering From Data: `.map()` Over an Array

```jsx
// Level.jsx — rendering NPCs from JSON data
{levelData.npcs.map(npc => (
  <NPC
    key={npc.id}
    npcId={npc.id}
    name={npc.name}
    position={npc.position}
    rotation={npc.rotation}
    phaseOffset={npc.phaseOffset}
  />
))}
```

This produces *identical output* to the three hardcoded `<NPC>` tags. But now the data drives the render. Add an object to the JSON array — get a new NPC. Remove one — it disappears. The code didn't change.

This pattern is used everywhere in React: rendering lists of items, generating form fields from a schema, building navigation from a route config. Seeing it in 3D just makes the concept more concrete.

### Trigger Volumes: Proximity Zones That Fire Events

A **trigger volume** is an invisible region of space. When the player enters it, something happens. Every game has them — area discovery, quest progression, audio transitions, loading zones.

The implementation in `Level.jsx`:

```javascript
useFrame(() => {
  const px = camera.position.x
  const pz = camera.position.z

  for (const trigger of levelData.triggers) {
    if (firedRef.current.has(trigger.id)) continue  // already fired

    // XZ-plane distance — ignore Y, triggers are "on the map"
    const dx   = px - trigger.position[0]
    const dz   = pz - trigger.position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < trigger.radius) {
      firedRef.current.add(trigger.id)
      discoverArea(trigger.id)
    }
  }
})
```

**Why XZ only (ignoring Y)?** The player's Y position varies with terrain height. But we want "are you near this map location" — not "are you at exactly this altitude." A trigger near the lake should fire whether the player is walking on level ground or jumping.

**Why `useRef` for `firedRef` instead of `useState`?** This code runs 60 times per second. If we used `setState` to track fired triggers, every discovery event would cause a re-render. The `useRef` approach mutates a `Set` object directly — zero re-renders, O(1) lookup. This is the same pattern seen in Player.jsx and everywhere performance matters in the game loop.

**Why a `Set` and not an array?** `Set.has(id)` is O(1) — it checks membership in constant time regardless of how many triggers exist. `Array.includes(id)` is O(n) — it scans the entire array every check. With 7 triggers checked 60 times per second, the difference is small. With 700 triggers, it matters. Reaching for the right data structure from the start is a good habit.

---

## 3. Phase 4.2 — Procedural Terrain

### Files: `src/systems/terrain.js`, `src/components/World.jsx`, `src/components/Player.jsx`, `src/components/Trees.jsx`, `src/components/Rocks.jsx`

### Why Procedural?

The alternative is **authored terrain**: an artist creates a heightmap image (black = low, white = high) in a tool like Blender, exports it, and the game loads it. This produces higher quality results but requires an asset pipeline.

Procedural terrain generates the heightmap mathematically at runtime using noise functions. The advantages for this project:

- No external assets needed — the terrain IS the code
- Fully deterministic — `getTerrainHeight(x, z)` always returns the same value for the same input, on any machine, any time
- Infinitely tunable — change amplitude constants, add octaves, adjust the flatten radius in `terrain.js` and the entire world reshapes instantly

The disadvantage: you can't sculpt specific features by hand. What the noise function produces is what you get.

### The `terrain.js` Module: One Source of Truth

This is the most architecturally important decision in Phase 4: terrain height is defined in **one place** and consumed from **multiple places**.

```
terrain.js (defines getTerrainHeight)
   ├── imported by World.jsx    → displaces geometry vertices at startup
   ├── imported by Player.jsx   → queries ground height every frame
   ├── imported by Trees.jsx    → snaps trees to ground at mount
   └── imported by Rocks.jsx    → snaps rocks to ground at mount
```

If `World.jsx` had its own height calculation and `Player.jsx` had a different one, the player's physics ground would be a different surface from the visible terrain. The player would float or sink. By sharing one function, the visual geometry and the physical world are guaranteed identical.

This is the **single source of truth** principle — one of the most important ideas in software engineering. Duplicate logic always diverges eventually.

### Noise: The Foundation of Procedural Generation

To understand terrain generation, you need to understand noise.

**The problem with `Math.random()`:** It is not useful for terrain because it is not spatially coherent. `Math.random()` at position (1.0, 0.0) has no relationship to `Math.random()` at position (1.1, 0.0). Adjacent terrain vertices would have completely unrelated heights — spiky chaos.

We need noise that is:
1. **Smooth** — adjacent positions give similar values
2. **Deterministic** — same input always gives same output
3. **Varied** — different positions give different values

**Value Noise** provides all three. The algorithm:

```javascript
function hash(x, y) {
  // Deterministic pseudo-random float from two integers
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)  // fractional part only → [0, 1)
}

function valueNoise(x, y) {
  // Integer grid corners that contain this point
  const ix = Math.floor(x),  iy = Math.floor(y)
  // Fractional position within the grid cell
  const fx = x - ix,         fy = y - iy

  // Smoothstep: 3t² − 2t³  (makes interpolation smooth, not linear)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  // Bilinear interpolation of four corner hashes
  return (
    hash(ix,     iy)     * (1 - ux) * (1 - uy) +  // bottom-left
    hash(ix + 1, iy)     * ux       * (1 - uy) +  // bottom-right
    hash(ix,     iy + 1) * (1 - ux) * uy       +  // top-left
    hash(ix + 1, iy + 1) * ux       * uy           // top-right
  )
}
```

**Step by step:**

1. Take the real-valued coordinates (e.g., x=3.7, z=8.2)
2. Identify the four integer grid corners that surround this point: (3,8), (4,8), (3,9), (4,9)
3. Hash each corner to a deterministic pseudo-random value using the sine trick
4. Interpolate between the four corner values based on where in the cell (3.7, 8.2) falls
5. Use smoothstep instead of linear interpolation so the result has no sharp "creases" where cells meet

The sine-based hash is not cryptographically secure, but it's fast, cheap, and good enough for visual noise. The formula `Math.sin(x * 127.1 + y * 311.7) * 43758.5453` was chosen empirically — the large prime-ish constants ensure different (x, y) inputs map to visually uncorrelated outputs.

### Fractional Brownian Motion (FBM)

Single-octave value noise produces smooth, gentle variation — adequate for rolling hills, but lacking the detail of real terrain. Real landscapes have large hills AND medium ridges AND small bumps.

FBM (sometimes called "fractal noise" or "octave noise") stacks multiple noise layers at different scales:

```javascript
const OCTAVES = [
  { scale: 0.007, amplitude: 4.5  },  // large hills (150 unit wavelength)
  { scale: 0.022, amplitude: 1.4  },  // medium undulation
  { scale: 0.070, amplitude: 0.40 },  // small bumps
  { scale: 0.190, amplitude: 0.10 },  // fine surface grain
]

function getTerrainHeight(x, z) {
  let h = 0
  for (const { scale, amplitude } of OCTAVES) {
    h += (valueNoise(x * scale + 100, z * scale + 100) - 0.5) * 2 * amplitude
  }
  // ... spawn flatten
  return h * st
}
```

Each octave doubles (roughly) the frequency and halves the amplitude. The sum produces a signal that varies at many scales simultaneously — the mathematical equivalent of looking at a landscape at different zoom levels.

Note the `-0.5) * 2` term: `valueNoise` returns [0, 1]. Biasing to [−1, +1] gives terrain that has valleys below zero as well as hills above it. Without this, everything would be above ground level (all positive) and you'd only have hills, no valleys.

The `+ 100` offset is critical: without it, the noise would always evaluate to the same degenerate value at the world origin (0, 0), where `Math.sin(0)` always returns 0. Offsetting by 100 puts the origin well within a non-degenerate region of the noise field.

### The Spawn Flatten: Radial Smoothstep

Buildings, NPCs, and the player spawn near the world origin. A bumpy spawning area would cause objects to clip into terrain or the player to start falling.

The fix is a **radial flatten** — multiply the terrain height by a factor that is 0 at the origin and rises smoothly to 1 at the edge of the flatten radius:

```javascript
const FLAT_RADIUS = 52   // units around origin that are kept flat

const dist = Math.sqrt(x * x + z * z)
const t    = Math.min(1, dist / FLAT_RADIUS)       // 0 at origin, 1 at radius
const st   = t * t * (3 - 2 * t)                  // smoothstep

return h * st
```

**What is smoothstep?** Linear interpolation (`t`) creates a sharp edge where the flat zone ends and the terrain begins. Smoothstep (`3t² − 2t³`) has zero derivative at both endpoints — it starts and ends flat. The transition from flat to hilly is C1 continuous (no kink). This is the same formula used in CSS `transition` timing functions and GPU shaders.

Smoothstep is one of the most useful mathematical tools in graphics programming. Memorise this: `3t² − 2t³`.

The result: everything within 52 units of origin is flat. Beyond 52 units, hills rise gently. The buildings (furthest at ~42 units) all sit on flat ground. Trees and rocks placed at positions 60+ units out follow the terrain.

### Vertex Displacement: How Geometry Gets Bumpy

The terrain geometry is a `PlaneGeometry` — a flat grid of triangles. The magic happens in `World.jsx`:

```javascript
const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
geo.rotateX(-Math.PI / 2)  // PlaneGeometry starts vertical; rotate to lie flat

const positions = geo.attributes.position.array  // Float32Array: [x0,y0,z0, x1,y1,z1, ...]

for (let i = 0; i < positions.length / 3; i++) {
  const x = positions[i * 3]
  const z = positions[i * 3 + 2]
  positions[i * 3 + 1] = getTerrainHeight(x, z)  // overwrite Y
}

geo.computeVertexNormals()  // MANDATORY — without this, lighting is wrong
```

**BufferAttribute and the flat array:** Three.js stores geometry data in `Float32Array` — a typed array (more memory-efficient than a regular JS array). For vertex positions, the format is `[x0, y0, z0, x1, y1, z1, x2, y2, z2, ...]` — all values interleaved. Vertex `i` lives at indices `i*3`, `i*3+1`, `i*3+2`. This format is what the GPU natively expects; Three.js doesn't reformat it before uploading.

**Why computeVertexNormals() is mandatory:** Surface normals tell the lighting system which direction a face is pointing. `PlaneGeometry` initialises all normals pointing straight up `(0, 1, 0)` — correct for a flat plane. After you displace vertices to create hills, the normals are wrong: a 30° slope should have a normal tilted 30° from vertical, not pointing straight up. `computeVertexNormals()` recomputes every vertex normal by averaging the geometric normals of all triangles that share that vertex. Skip this call and terrain lighting looks completely flat regardless of slope — a very confusing bug.

**UV tiling:** PlaneGeometry UV coordinates default to `[0,1] → [1,1]` — the texture covers the plane exactly once. For a 280-unit-wide terrain, that would stretch the grass texture across the entire thing (one blade of grass 280 metres wide). We want it to tile:

```javascript
uvs[i * 2]     = uvs[i * 2]     * TERRAIN_SIZE / tileSize
uvs[i * 2 + 1] = uvs[i * 2 + 1] * TERRAIN_SIZE / tileSize
```

With `tileSize = 3`, the UV at the edge of the plane becomes `280/3 ≈ 93` — the texture wraps 93 times. Combined with `RepeatWrapping` on the texture, the GPU wraps UV coordinates that exceed 1.0 back around to 0.0, giving you repeating tile coverage across the whole terrain.

### Player Follows Terrain: The Ground Check Update

Before Phase 4, Player.jsx had a fixed ground level:

```javascript
// Before (Phase 1)
if (camera.position.y <= EYE_HEIGHT) {
  camera.position.y = EYE_HEIGHT  // always 1.7 above world origin
}
```

After Phase 4:

```javascript
// After (Phase 4)
const groundY = getTerrainHeight(camera.position.x, camera.position.z) + EYE_HEIGHT

if (camera.position.y <= groundY) {
  camera.position.y = groundY
  velocityY.current = 0
}
```

This single change makes the player's physics ground match the visible terrain. Walk up a hill — the ground follows. Walk into a valley — you descend. The head bob, footstep audio, and jump detection all use `groundY` instead of the constant `EYE_HEIGHT`, so everything stays coherent.

Note that `getTerrainHeight` is called every frame in `useFrame`. It's a pure function with no side effects and no allocations — just arithmetic. This is fast; no caching needed.

---

## 4. Phase 4.3 — Day/Night Cycle

### Files: `src/components/DayNightCycle.jsx`

### The Core Engineering Pattern: Ref Mutation in useFrame

This is the most important rendering pattern taught in Phase 4. Understand it completely.

**The problem:** Many properties of a 3D scene need to change every frame. Light intensity, light colour, fog colour, sky shader uniforms. How do you update them at 60Hz without causing 60 React re-renders per second?

**Wrong approach:**

```javascript
// BAD — causes a React re-render every single frame
const [sunIntensity, setSunIntensity] = useState(1.0)

useFrame((_, delta) => {
  setSunIntensity(computeIntensity())  // re-render!
})

return <directionalLight intensity={sunIntensity} />
```

At 60fps, this calls `setSunIntensity` 60 times per second. Each call schedules a React re-render. React re-renders the component, diffs the virtual DOM, and updates the Three.js object. This works, but it's 60 React reconciliation cycles per second that we don't need.

**Right approach:**

```javascript
// GOOD — zero re-renders, direct Three.js mutation
const lightRef = useRef()

useFrame((_, delta) => {
  if (lightRef.current) {
    lightRef.current.intensity = computeIntensity()  // direct mutation, no React
    lightRef.current.color.setHSL(0.08, saturation, lightness)
  }
})

return <directionalLight ref={lightRef} intensity={1.0} color="#fff5e0" />
```

`lightRef.current` is the actual `THREE.DirectionalLight` JavaScript object. Mutating `lightRef.current.intensity` directly changes the Three.js property. On the next render frame, the GPU reads the updated value. React is not involved. No reconciliation, no re-renders, no overhead.

**Why does this work?** Three.js and React are separate systems. React manages the virtual DOM and the React component tree. Three.js manages the scene graph — a tree of JavaScript objects that the renderer reads every frame. R3F's `ref` prop gives you a direct pointer into the Three.js scene graph, bypassing React entirely. Mutating through that ref is like reaching directly into the GPU data — fast and completely outside React's update cycle.

This pattern is used for anything that needs to change at frame rate: camera animation, particle systems, physics updates, UI elements that track 3D position. Learn this pattern and you'll use it constantly.

### Time and the Sun's Position

The day/night cycle uses a single time value — a float from 0 to 1 representing progress through one full day:

```
0.00 = midnight
0.25 = dawn (sun at east horizon)
0.50 = noon (sun at zenith)
0.75 = dusk (sun at west horizon)
1.00 = midnight again
```

The sun traces a circle in the XY plane:

```javascript
const angle = t * Math.PI * 2 - Math.PI * 0.5  // offset so t=0.25 = east horizon
const sunX  = Math.cos(angle) * 100
const sunY  = Math.sin(angle) * 100
```

Plugging in values:
- `t=0.25` → `angle = π/2 - π/2 = 0` → `(cos 0, sin 0) = (100, 0)` — sun on the east horizon ✓
- `t=0.50` → `angle = π - π/2 = π/2` → `(cos π/2, sin π/2) = (0, 100)` — sun at zenith ✓
- `t=0.75` → `angle = 3π/2 - π/2 = π` → `(cos π, sin π) = (-100, 0)` — sun on west horizon ✓

### Light Parameter Curves

All light properties derive from two values: `sunY` (raw Y position) and `sunElevation` (normalised to 0–1):

```javascript
const sunElevation = sunY / 100  // 0 at horizon, 1 at zenith, negative below
const isDay        = sunY > -8   // small threshold for soft night onset
```

**Intensity with a power curve:**

```javascript
sunRef.current.intensity = isDay
  ? Math.pow(Math.max(0, sunElevation), 0.4) * 1.5
  : 0
```

`Math.pow(x, 0.4)` is a concave function — it rises quickly from 0 and then flattens. This means the sun brightens fast after sunrise and stays bright through most of the day, dimming again only near sunset. Linear intensity (`sunElevation * 1.5`) would make the midday seem dim relative to dawn — the opposite of the natural experience.

**Colour with HSL:**

```javascript
const sat = isDay ? Math.max(0, (1 - sunElevation) * 0.85) : 0
const lit = isDay ? Math.max(0, sunElevation * 0.55 + 0.45) : 0.02
sunRef.current.color.setHSL(0.08, sat, lit)
```

HSL (Hue, Saturation, Lightness) is far more intuitive than RGB for light colour. Hue 0.08 is orange. As `sunElevation` rises (sun gets higher), saturation drops (orange fades to white) and lightness increases (light gets brighter). At noon, saturation ≈ 0 and lightness ≈ 1.0 — nearly white light. At dawn, saturation ≈ 0.85 and lightness ≈ 0.45 — vivid orange. This is physically accurate: low-angle sunlight passes through more atmosphere, scattering more blue and leaving a richer orange/red.

### Updating the Sky Shader's Uniforms

The `Sky` component from Drei renders a `THREE.Sky` — a large sphere with a custom GLSL atmospheric scattering shader. The shader has a `sunPosition` uniform that controls where the sun appears in the sky gradient.

Because we want to update this every frame without re-rendering the Sky component, we bypass React and write directly to the shader uniform:

```javascript
if (skyRef.current?.material?.uniforms?.sunPosition) {
  skyRef.current.material.uniforms.sunPosition.value.set(sunX, sunY, sunZ)
}
```

`skyRef.current` is the THREE.Mesh. `.material` is its ShaderMaterial. `.uniforms.sunPosition.value` is a `THREE.Vector3` that the GLSL shader reads as `uniform vec3 sunPosition`. Setting it directly — no React — the shader sees the new value on the next render frame.

**What are shader uniforms?** A uniform is a variable that is the same for every vertex and fragment in a draw call. You set it on the CPU side (JavaScript) before the draw, and the shader reads it on the GPU side (GLSL). Changing a uniform doesn't require re-uploading geometry — it just changes one value that the shader reads. This is why uniform-based animation (time, light position, colour) is extremely cheap.

### Updating Fog Colour

`<fogExp2>` creates a `FogExp2` object and attaches it to `scene.fog`. We can't attach a `ref` to an R3F intrinsic like `<fogExp2>`, so we access it through the `scene` object that `useFrame` provides:

```javascript
useFrame(({ scene }, delta) => {
  if (scene.fog) {
    scene.fog.color.setRGB(fr, fg, fb)
  }
})
```

`useFrame` always provides `{ gl, scene, camera, clock, ... }`. The `scene` is the root THREE.Scene — accessing `scene.fog` gives the fog object directly. Mutating `scene.fog.color` changes the fog colour on the next rendered frame. Again: no React, direct Three.js mutation, zero re-renders.

---

## 5. Phase 4.4 — Water

### Files: `src/components/Water.jsx`, `src/systems/TextureGenerator.js` (water texture)

### UV Scrolling: Animate Without Touching Geometry

Water is one of the most instructive rendering techniques precisely because of how *little* work it actually does. There is no simulation. No wave physics. No vertex animation. The geometry is completely static — a flat plane that never changes position or shape.

What moves is the **texture's UV offset**.

Every vertex in a mesh has a UV coordinate — a 2D point that maps the vertex onto the texture image. The GPU interpolates UVs across triangle faces and samples the texture at the interpolated UV for each pixel.

`THREE.Texture.offset` is a Vector2 that is **added** to all UV coordinates before sampling:

```javascript
useFrame(({ clock }) => {
  const t = clock.getElapsedTime()
  albedoRef.current.offset.set(t * 0.028, -t * 0.016)   // drift south-east
  normalRef.current.offset.set(-t * 0.018,  t * 0.022)  // drift north-east
})
```

After 10 seconds: `albedo.offset = (0.28, -0.16)`. Every UV is shifted by that amount before texture lookup. The texture appears to have moved — the pixels are in different positions on the plane. Because `RepeatWrapping` is set, UVs that exceed 1.0 wrap back around to 0.0 (seamlessly, if the texture is tileable), giving infinite scroll.

The albedo (colour) map drifts in one direction. The normal map drifts in a different direction. The lighting calculation uses the normal map to determine specular highlights — when the normal map moves, the specular highlights shift and shimmer. The superposition of two independently scrolling patterns produces interference that resembles disturbed water.

This technique — **UV scrolling** — is used in virtually every game for water, lava, smoke scrolling across a surface, animated signs, fire planes, and conveyor belts. It's the cheapest possible animation: one `Vector2` update per frame, no geometry changes at all.

### The Water Normal Map: Wave Interference

The water texture in `TextureGenerator.js` encodes surface normals using wave interference:

```javascript
function waterHeight(px, py, size) {
  const nx = (px / size) * 8
  const ny = (py / size) * 8
  const w1 = Math.sin(nx * 2.1 + ny * 0.8) * 0.5 + 0.5  // wave 1
  const w2 = Math.sin(nx * 0.6 - ny * 2.4) * 0.5 + 0.5  // wave 2
  return w1 * 0.6 + w2 * 0.4
}
```

Two sine waves at different frequencies and angles are added together. Where both waves are positive (constructive interference), the height is high — the normal map has a peak, and lighting shows a highlight. Where one is positive and one negative (destructive interference), they partially cancel — the normal map is flat, the surface looks calm.

This interference pattern, when scrolled in two perpendicular directions, produces a convincing impression of crossing ripples — like throwing two pebbles in different places on a pond.

### Cloning Textures for Independent State

A critical implementation detail:

```javascript
const albedoMap = albedo.clone()   // ← clone before setting offset
albedoMap.needsUpdate = true
```

A `THREE.Texture` is a GPU resource — the pixel data lives in GPU memory. If two meshes share the same texture object and you mutate `texture.offset`, **both meshes move simultaneously**. Cloning creates a new JavaScript wrapper with its own `offset`, `repeat`, and other state, while the underlying GPU pixel data is shared (not copied). This is cheap — clone() does not re-upload the texture.

Why does this matter for water? If you have two lakes and don't clone the texture, scrolling one lake scrolls both at the same rate and direction. With independent clones, each lake can have its own drift direction and speed.

### Transparency and `depthWrite`

Water is transparent (`transparent: true, opacity: 0.82`). Three.js handles transparency by rendering all transparent objects after all opaque objects, sorted back-to-front so blending is correct.

`depthWrite: false` prevents the water plane from writing to the depth buffer. Normally, when a pixel is rendered, its depth is written to the depth buffer, and subsequent renders at greater depth are discarded. For transparent objects, writing to depth causes objects behind the water to be culled before the blend happens — they disappear instead of showing through. Setting `depthWrite: false` fixes this: the water contributes colour via blending but doesn't block depth testing for geometry behind it.

---

## 6. The Architecture Lesson: One Pattern, Four Applications

Looking across the four Phase 4 systems, the same architectural principle appears repeatedly: **separate what changes from what doesn't**.

| System | What's Static | What Changes |
|---|---|---|
| **Terrain** | Geometry (built once in useMemo) | Player position query (every frame) |
| **Level** | JSON data | Trigger state (firedRef, every frame) |
| **Day/Night** | Sky props, light setup | Intensity, colour, fog (every frame via ref) |
| **Water** | Geometry, material setup | UV offset (every frame via ref) |

This is the **immutable setup / mutable runtime** pattern. You do expensive work once (building geometry, parsing JSON, creating materials) and then run cheap mutations every frame. The expensive work lives in `useMemo`, `useEffect`, or module-level code. The cheap mutations live in `useFrame` and operate through refs.

If you find yourself calling `setState` from `useFrame`, ask: "Does React actually need to know about this?" If it's a property of a Three.js object (position, intensity, colour, UV offset), the answer is almost always no — use a ref.

### The Shared Module Pattern

`terrain.js` exports one function, `getTerrainHeight`. It has no state, no side effects, no dependencies beyond the noise math. It is a pure function.

This function is imported by four different files. They all get the same terrain. If you change the noise parameters in `terrain.js`, all four consumers — World.jsx, Player.jsx, Trees.jsx, Rocks.jsx — update automatically.

This is the principle of **pure functions as shared ground truth**. A pure function is the ideal unit of shared logic because:
- It has no state to accidentally mutate
- It has no dependencies that could cause import cycles
- It can be tested in isolation (call it with known inputs, check the output)
- Any consumer that calls it with the same input gets the same answer

Terrain height is a mathematical fact about the world — it should be computed by a mathematical function, not stored in a React component.

---

## 7. Exercises

Work through these with the source code open. Each exercise builds directly on the patterns taught above.

**Exercise 1 — Terrain tuning.** Open `src/systems/terrain.js`. Change the first octave's `amplitude` from `4.5` to `8.0`. Reload. What happens? Set it back to `2.0`. What's the difference? Experiment with `FLAT_RADIUS` — change it from `52` to `10`. What breaks, and why?

**Exercise 2 — Add a fourth NPC.** Open `public/levels/level_01.json`. Add a new object to the `npcs` array with a new id (`npc_04`), position, and rotation. Reload. Does it appear? Now add dialogue for `npc_04` in `src/data/dialogue.js` following the existing pattern.

**Exercise 3 — Add a new trigger zone.** Add a trigger to `level_01.json`'s `triggers` array. Give it a position somewhere on the map and a radius of 10. Walk to that position. Check the browser console — you should see `[Level] Discovered: "..."`. Now add a second trigger that fires immediately on spawn (position `[0, 0, 0]`, radius `5`).

**Exercise 4 — Faster or slower day.** In `src/components/DayNightCycle.jsx`, `CYCLE_DURATION` is `90` seconds. Change it to `30`. Watch the sky. Change it to `600` (10 minutes). What would a good day length be for a game?

**Exercise 5 — Night-only mode.** Modify `DayNightCycle.jsx` to start at `timeRef.current = 0.0` (midnight) and slow `CYCLE_DURATION` to `600`. Explore the world at night. Notice how ambient occlusion from post-processing becomes more pronounced, and the building windows' emissive glow becomes visible. The emissive windows were always there — at night they finally matter.

**Exercise 6 — Third water lake.** In `src/components/Water.jsx`, add a third lake to the `LAKES` array. Pick a position at least 60 units from the origin (where terrain is bumpy). Set the Y position to match the terrain height at that location — call `getTerrainHeight(x, z)` in a browser console to find the right value. Does the water sit flush with the terrain?

**Exercise 7 — Trigger debug rings.** In `src/components/Level.jsx`, change `SHOW_TRIGGERS` from `false` to `true`. Reload. You should see glowing rings marking all trigger zones. Walk through them. Useful for debugging level design. Set it back to `false` when done — this is the standard "debug flag" pattern used in game development.

**Exercise 8 — UV scroll speed.** In `Water.jsx`'s `useFrame`, change the scroll speed multipliers. Make the albedo scroll 4× faster (`t * 0.112`). Make the normal map scroll in the opposite direction (`t * 0.018` instead of `-t * 0.018`). What visual effect does reversing the normal map direction have?

**Exercise 9 — Smoothstep vs linear.** In `terrain.js`, replace the smoothstep flatten with a linear version: `const st = Math.min(1, dist / FLAT_RADIUS)` (remove the `t * t * (3 - 2 * t)` step). Reload. Walk to the edge of the settlement. Can you see the difference in how the terrain transitions from flat to hilly? Now restore the smoothstep. The difference is subtle but the smoothstep version is always the correct choice.

**Exercise 10 — Custom level file.** Create `public/levels/level_02.json` as a copy of `level_01.json`. Change NPC positions, trigger locations, and spawn point. In `Level.jsx`, swap the import from `level_01.json` to `level_02.json`. Does the scene change? This is the first step toward a real level selection system.

---

*The skills demonstrated in Phase 4 — procedural generation, ref-mutation animation, UV animation, data-driven architecture — appear in virtually every 3D web application and game. The specific APIs (Three.js, R3F, Vite's JSON import) will change with time. The underlying principles will not.*
