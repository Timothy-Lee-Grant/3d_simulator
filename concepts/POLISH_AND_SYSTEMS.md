# Polish and Systems Depth — Phase 7

> The difference between a tech demo and a game: maps, persistence, optimised rendering, and real-time debug tools.

---

## 7.1 — Minimap

### Two approaches

**Approach 1 — Procedural Canvas 2D** (implemented in `Minimap.jsx`)

The world object positions are known at compile time, so the minimap draws them as colored shapes on a `<canvas>` element using the Canvas 2D API. No GPU involvement. Extremely fast.

```js
// World → Canvas coordinate conversion
const toCanvas = (wx, wz) => [
  MAP_CENTER + (wx - playerX) * scale,
  MAP_CENTER - (wz - playerZ) * scale,  // ← negate Z: world -Z = canvas up
]
```

The negation of Z is the key gotcha: Three.js uses right-handed coordinates where -Z points toward the viewer (north), but canvas Y increases downward. Negating makes north point up on the map.

**Approach 2 — WebGL render target** (implemented in `MinimapRenderTarget.jsx`)

Renders the actual 3D scene from a top-down orthographic camera into an off-screen framebuffer (`WebGLRenderTarget`), reads the pixels back to the CPU, and writes them to a DOM `<canvas>`.

```js
// The three-step pipeline:
gl.setRenderTarget(renderTarget)     // redirect GPU output
gl.render(scene, minimapCamera)      // render the whole scene from above
gl.setRenderTarget(null)             // restore screen output

gl.readRenderTargetPixels(...)       // GPU → CPU readback (expensive!)
ctx.putImageData(...)                // write to DOM canvas
```

### The render target pipeline

A `WebGLRenderTarget` is an off-screen framebuffer. Normally the GPU writes pixels to the screen's default framebuffer. Calling `gl.setRenderTarget(rt)` redirects all rendering to a texture in GPU memory instead.

Uses for render targets:
- **Minimap** — render from above, show in HUD
- **Security camera displays** — render to a texture, apply to an in-world screen mesh
- **Reflections** — render scene from a reflective surface's point of view
- **Post-processing** — all EffectComposer effects (bloom, vignette) use render targets internally
- **Shadow maps** — depth render from the light's perspective

### The GPU sync problem

`readRenderTargetPixels()` copies pixels from GPU → CPU. This forces a **pipeline sync**: the CPU must wait for the GPU to finish writing before it can read. Modern GPUs are asynchronous — they process several frames ahead — so this stall can cost 2–5ms.

Mitigations:
- Only read back at low frequency (10fps for a minimap)
- Prefer approach 1 (Canvas 2D) when object positions are known
- When you MUST read back: use a Pixel Buffer Object (PBO) for async readback

---

## 7.2 — Save / Load System

### localStorage

`localStorage` is a key→string map that persists across browser sessions, tab closes, and computer restarts. Up to ~5–10 MB, synchronous, same-origin only.

```js
localStorage.setItem('key', JSON.stringify(data))  // write
const raw = localStorage.getItem('key')            // read (null if missing)
localStorage.removeItem('key')                     // delete
```

### What to save

The save file captures everything needed to restore the world state exactly:

```json
{
  "version": 2,
  "timestamp": 1748937600000,
  "player": {
    "position": { "x": 12.4, "y": 1.7, "z": -28.1 },
    "health": 85,
    "inventory": [{ "id": "item_key", "name": "Ancient Key", ... }],
    "equippedSlot": 0
  },
  "world": {
    "interactedNPCs": ["npc_01"],
    "discoveredAreas": ["area_fountain"],
    "pickedUpItems": []
  }
}
```

Deliberately NOT saved: `stamina` (regenerates on load), `cameraYaw` (player can look around freely).

### Save versioning

Always embed a `version` field. When you change the schema (new field, renamed key), bump the version constant and reject saves with mismatched versions:

```js
const SAVE_VERSION = 2
if (data.version !== SAVE_VERSION) {
  console.warn('Save version mismatch — discarding')
  return null
}
```

The alternative is a migration function per version — a map from old schema to new:
```js
const migrations = {
  1: (data) => ({ ...data, version: 2, world: { ...data.world, discoveredAreas: [] } }),
}
```

### Auto-save

Save every 30 seconds while the player is in-game. The interval is only active while the pointer is locked (i.e., the player is actually playing):

```js
useEffect(() => {
  if (!locked) return
  const id = setInterval(() => saveGame(), 30_000)
  return () => clearInterval(id)
}, [locked])
```

`localStorage.setItem` is synchronous and blocks the JS thread for the duration of the write. A ~2KB save file takes <1ms — negligible. For larger save data, use `IndexedDB` which is async.

---

## 7.3 — Level of Detail (LOD)

### Why triangles at distance are wasted

The GPU processes every triangle in every visible mesh every frame. A sphere 200 units away is rendered at sub-pixel size — it occupies fewer screen pixels than a single rendered quad. Its 1,024 triangles contribute zero visible detail.

LOD systems solve this by swapping to progressively simpler geometry as objects recede:

| Distance | Geometry | Triangles |
|---|---|---|
| 0–15 units | High poly (sphere 12×9) | ~200 |
| 15–35 units | Medium poly (sphere 8×6) | ~80 |
| 35–70 units | Low poly (sphere 5×4) | ~30 |
| 70+ units | Billboard (sprite quad) | **2** |

### THREE.LOD

```js
const lod = new THREE.LOD()

lod.addLevel(highPolyMesh,  0)   // switch to this at distance 0–14
lod.addLevel(medPolyMesh,  15)   // switch to this at distance 15–34
lod.addLevel(lowPolyMesh,  35)   // switch to this at distance 35–69
lod.addLevel(billboard,    70)   // switch to this at distance 70+

// Every frame — measures distance and activates correct level
lod.update(camera)
```

`addLevel(object, distance)` means: "use this object when the camera is at least `distance` units away." Level 0 (distance=0) is always the highest-detail version.

### Billboards

A billboard is a flat quad that always faces the camera. Three.js provides `THREE.Sprite` — a mesh that auto-billboards without you needing to set rotation:

```js
const sprite    = new THREE.Sprite(spriteMaterial)
sprite.scale.set(width, height, 1)  // world-unit dimensions
```

`SpriteMaterial` is a simple material that takes a texture. Drawing a tree image on a sprite gives a convincing distant tree at 2 triangles instead of 100+.

For a dense forest of 5,000 distant trees:
- Full geometry: 500,000 triangles → likely unrenderable at 60fps
- Billboards: 10,000 triangles → trivial

### LOD + Instancing

The most scalable combination is instanced LOD: maintain 3 separate `InstancedMesh` objects (high, medium, low), and each frame classify instances into buckets by distance. Each bucket corresponds to one instanced mesh. This keeps draw calls at 3 regardless of instance count or LOD level.

This is what production game engines do internally. Three.js doesn't provide this out of the box — it's custom per project.

---

## 7.4 — Debug Tools

### Why debug tooling matters

The difference between a 3-day bug hunt and a 3-minute fix is often a single number you can see in real time. Every debugging session starts with "what is the actual value of X right now?"

Real-time debug panels let you:
- Tune values (speed, fog, gravity) by dragging a slider and seeing the result immediately, instead of edit → save → reload → test → repeat
- Verify assumptions ("is the player actually at position X?")
- Toggle features to isolate which one is causing a problem

### Leva

The standard library for R3F debug panels. Install with `npm install leva`.

```jsx
import { useControls } from 'leva'

function Player() {
  const { walkSpeed, sprintSpeed, fov } = useControls('Player', {
    walkSpeed:   { value: 7,    min: 1, max: 20 },
    sprintSpeed: { value: 14,   min: 5, max: 30 },
    fov:         { value: 75,   min: 40, max: 120 },
  })
  // Use walkSpeed, sprintSpeed, fov instead of constants
}
```

Leva generates a floating panel in the browser automatically — no component needed. Values persist across hot-reloads.

### The pattern without Leva

This project implements the same pattern with a custom React panel + Zustand:

```js
// useDebugStore: holds all tunable values
const fogDensity = useDebugStore(s => s.fogDensity)

// FogSync (inside Canvas): applies the store value to Three.js objects
useFrame(() => { scene.fog.density = useDebugStore.getState().fogDensity })
```

This works because Three.js objects are plain JavaScript — mutating them in `useFrame` bypasses React and updates the GPU directly on the next render.

### Dev-only code

Vite (and most bundlers) replace `import.meta.env.DEV` with `true` in development and `false` in production:

```js
if (import.meta.env.DEV) {
  // This entire block is removed by the tree-shaker in production builds
  console.log('debug info')
}

// Conditional render — DebugPanel never loads in production
{import.meta.env.DEV && <DebugPanel />}
```

### Three.js debug helpers

These built-in helpers visualise common debugging scenarios:

```jsx
<axesHelper args={[5]} />          // XYZ axes as R/G/B lines at origin
<gridHelper args={[100, 20]} />    // ground grid
<boxHelper object={someMesh} />    // wireframe around a mesh's AABB
<arrowHelper args={[dir, origin, length, color]} />  // visualise a vector
```

For raycasts: draw an `arrowHelper` from the camera position in the forward direction to see exactly where the interaction ray points.

---

## Files added in Phase 7

| File | Purpose |
|---|---|
| `src/components/Minimap.jsx` | Procedural Canvas 2D bird's-eye map |
| `src/components/MinimapRenderTarget.jsx` | WebGL render target version (documented reference) |
| `src/systems/saveLoad.js` | `saveGame`, `loadGame`, `applyLoadedGame` — localStorage persistence |
| `src/components/LODTrees.jsx` | THREE.LOD with 4 levels + billboard sprites |
| `src/store/useDebugStore.js` | Zustand store for runtime-tunable dev values |
| `src/components/DebugPanel.jsx` | Custom debug panel (sliders, toggles, actions) |

---

## Summary: what Phase 7 teaches

| Concept | Where |
|---|---|
| Canvas 2D coordinate transforms | Minimap.jsx |
| WebGL render targets + GPU sync stalls | MinimapRenderTarget.jsx |
| Browser persistence (localStorage) | saveLoad.js |
| Save versioning + migration | saveLoad.js |
| LOD theory + THREE.LOD API | LODTrees.jsx |
| Billboard sprites | LODTrees.jsx |
| Debug store pattern | useDebugStore.js |
| Dev-only code elimination | DebugPanel.jsx, App.jsx |
| Direct Three.js object mutation from store | FogSync in App.jsx |
