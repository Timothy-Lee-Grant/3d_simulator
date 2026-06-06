# Advanced Rendering — Phase 6

> How real games load assets, animate characters, batch geometry, and write custom GPU programs.

---

## 6.1 — GLTF Model Loading

### What GLTF is

GLTF (GL Transmission Format) is the industry standard for real-time 3D assets. A `.glb` binary bundles everything a model needs into a single file:

- **Geometry** — vertex buffers, index buffers, UV coordinates
- **Materials** — PBR parameters: metalness, roughness, albedo color, normal maps
- **Textures** — embedded as Base64 images or referenced as separate files
- **Animations** — an array of `THREE.AnimationClip` objects (bone keyframes)
- **Scene hierarchy** — a node tree, equivalent to nested `<group>` elements

Every major 3D tool — Blender, Maya, Houdini, Substance Painter — exports GLTF. When you have a GLTF model, you no longer need TextureGenerator.js, manual geometry code, or procedural materials. The artist's work replaces all of it.

### Loading with useGLTF and Suspense

`useGLTF` from Drei hooks into React Suspense. When called with a URL, it either:
- Returns the loaded data immediately (if already cached)
- Throws a Promise (if still downloading) — React catches this and renders the `<Suspense fallback>` instead

```jsx
import { useGLTF } from '@react-three/drei'

function Tree({ position }) {
  // Suspends while downloading — parent must wrap in <Suspense>
  const { scene } = useGLTF('/models/tree.glb')

  // Clone the scene so each instance has independent transforms
  // (geometry and materials are still shared — this is efficient)
  return <primitive object={scene.clone()} position={position} />
}

// Preload at module level so the file downloads before component mounts
useGLTF.preload('/models/tree.glb')
```

### Animations with useAnimations

A GLTF model with skeletal animation contains `animations: AnimationClip[]`. Three.js plays these through an `AnimationMixer`. Drei's `useAnimations` wraps the mixer:

```jsx
import { useGLTF, useAnimations } from '@react-three/drei'

function Character({ position, state }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/character.glb')

  // Creates an AnimationMixer, returns actions keyed by clip name
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    const action = actions[state]    // e.g. 'CharacterArmature|Walk'
    if (!action) return
    action.reset().fadeIn(0.25).play()
    return () => action.fadeOut(0.25)
  }, [state, actions])

  return <primitive ref={group} object={scene.clone()} position={position} />
}
```

### Error boundary fallback

`useGLTF` throws if the file is missing or the network fails. Wrap it in an `ErrorBoundary + Suspense` to render a fallback instead of crashing:

```jsx
// GLTFWithFallback handles loading + errors + missing files
<GLTFWithFallback
  url="/models/tree.glb"
  fallback={<ProceduralTree position={[5, 0, -10]} />}
  position={[5, 0, -10]}
/>
```

The `GLTFWithFallback` component in `src/components/GLTFModel.jsx` provides this pattern ready to use.

### Free model sources

Place `.glb` files in `public/models/` and reference them as `/models/filename.glb`.

| Source | Quality | License |
|---|---|---|
| [Quaternius](https://quaternius.com/) | Excellent low-poly | CC0 |
| [KhronosGroup samples](https://github.com/KhronosGroup/glTF-Sample-Assets) | PBR reference models | Various |
| [Sketchfab](https://sketchfab.com/) | All quality levels | Filter by CC0/CC BY |

---

## 6.2 — Skeletal Animation and State Machines

### What skeletal animation is

A skeleton is a hierarchy of named bones — transform nodes with no geometry. The mesh has **skin weights**: each vertex stores which bones influence it and how much. When a bone rotates, all vertices with high weight for that bone follow it.

An **animation clip** is a timeline of bone transform keyframes. The `AnimationMixer` samples the clip at the current time and applies the resulting bone transforms to the skeleton.

In this project, NPCs use **procedural animation** (pure math) instead of imported keyframes, but the architecture is identical:

```
AnimationStateMachine
    ↓ blendWeight
Human.jsx useFrame
    ↓ blended rotation values
arm, leg, head group refs
    ↓ rotation.x / rotation.y mutations
Three.js scene transform graph
    ↓ computed world matrices
GPU vertex transforms
```

### The AnimationStateMachine

Found in `src/systems/AnimationStateMachine.js`. Manages transitions between named states (`IDLE`, `WALK`, `RUN`) with a smooth blend weight:

```js
const fsm = new AnimationStateMachine(ANIM.IDLE, /* blendSpeed */ 4.0)

// Trigger a transition
fsm.setState(ANIM.WALK)

// Each frame
fsm.update(delta)

// Read blend weights for animation math
const idleW = fsm.getWeight(ANIM.IDLE)  // 1→0 during idle→walk transition
const walkW = fsm.getWeight(ANIM.WALK)  // 0→1 during idle→walk transition
```

### Blending two animations

The key formula — every animated parameter is a weighted sum:

```js
// Arm rotation blended between idle sway and walk counterswing
armRef.current.rotation.x =
  idleW * (Math.sin(t * SWAY) * 0.055) +     // idle contribution
  walkW * (-stepR * 0.38)                      // walk contribution
```

At the start of a transition, `idleW=1, walkW=0`. Over 250ms, they cross: `idleW=0, walkW=1`. The arm flows smoothly between the two poses with no snap.

### Walk cycle math

A human gait has ~1.8 Hz step frequency (steps per second, not strides):

```js
const STEP = 11.3   // ω = 2π × 1.8 Hz

const stepL = Math.sin(t * STEP)            // left leg
const stepR = Math.sin(t * STEP + Math.PI) // right leg (180° opposite)

// Arms counterswing — right arm forward with LEFT leg
armL.rotation.x = -stepR * 0.38
armR.rotation.x = -stepL * 0.38

// Legs swing forward/back
legL.rotation.x = stepL * 0.45
legR.rotation.x = stepR * 0.45
```

### When to use procedural vs keyframed animation

| Procedural (math) | Keyframed (GLTF + AnimationMixer) |
|---|---|
| Idle breathing, weight shift | Full walk/run cycles |
| Simple oscillation | Facial expressions |
| No Blender required | Requires 3D authoring |
| Infinite variation via phase offsets | Exact authored motion |
| Easy to blend with math | Blend via `crossFadeTo()` |

---

## 6.3 — Instanced Rendering

### The draw call problem

A "draw call" is one CPU instruction to the GPU: "render this geometry with this material." The GPU is incredibly fast at rendering triangles — but each draw call has fixed CPU overhead (state recording, driver work, synchronization). Modern real-time budgets allow roughly **1,000–3,000 draw calls per frame** before the CPU becomes the bottleneck.

A forest of 500 trees × 3 meshes each = **1,500 draw calls** — your entire frame budget, for trees alone.

### How InstancedMesh works

`THREE.InstancedMesh(geometry, material, count)` renders `count` copies of `geometry` in **one draw call**. The GPU receives:

1. One vertex buffer (the shared mesh shape)
2. One material (shader + textures)
3. N instance matrices — a packed `Float32Array` on the GPU, one 4×4 matrix per instance

```js
const mesh = new THREE.InstancedMesh(geometry, material, 50)

const dummy = new THREE.Object3D()
for (let i = 0; i < 50; i++) {
  dummy.position.set(x, y, z)
  dummy.rotation.y = Math.random() * Math.PI * 2
  dummy.scale.setScalar(1 + Math.random() * 0.3)
  dummy.updateMatrix()                        // computes the 4×4 matrix
  mesh.setMatrixAt(i, dummy.matrix)           // writes to the Float32Array
}
mesh.instanceMatrix.needsUpdate = true        // re-uploads to GPU
```

In R3F, declare it with `<instancedMesh ref={...} args={[null, null, count]}>`.

### Per-instance color

Instances share one material, but each can have a unique color tint:

```js
mesh.setColorAt(i, new THREE.Color('#88cc66'))  // RGB tint for instance i
mesh.instanceColor.needsUpdate = true
```

The color is multiplied with the material's base color in the fragment shader. This gives each tree canopy a different shade of green at no extra cost.

### Static vs dynamic instances

**Static** (rocks, buildings): set matrices once in `useEffect`, never update. `instanceMatrix.needsUpdate = true` only once.

**Dynamic** (wind-swaying canopies): update matrices every frame in `useFrame`. `instanceMatrix.needsUpdate = true` every frame. Still only **one draw call** — the CPU just re-uploads the buffer.

### Draw call comparison

| System | Previous | Phase 6 |
|---|---|---|
| Trees (8 → 50) | ~24 draw calls | 3 draw calls |
| Rocks (5 → 30) | 5 draw calls | 1 draw call |
| Grass (new, 2000 blades) | N/A | 1 draw call |

---

## 6.4 — Custom Shaders in GLSL

### The GPU rendering pipeline

For every mesh, the GPU runs two programs:

**Vertex shader** — runs once per vertex (corner of a triangle):
- Input: `position`, `normal`, `uv` attributes
- Output: `gl_Position` — where this vertex lands on screen (clip space)
- Can also write `varying` values interpolated to the fragment shader

**Fragment shader** — runs once per pixel covered by the triangle:
- Input: interpolated `varying` values from the vertex shader
- Output: `gl_FragColor` — the RGBA color of this pixel

### Variable types

| Type | Direction | Description |
|---|---|---|
| `uniform` | JS → both shaders | Same value for all vertices/fragments. Set via `material.uniforms.name.value`. |
| `varying` | vertex → fragment | Set in vertex shader, GPU interpolates across the triangle, available in fragment. |
| `attribute` | buffer → vertex only | Per-vertex data from geometry (built-in: `position`, `normal`, `uv`). |

### ShaderMaterial in R3F

```jsx
const mat = new THREE.ShaderMaterial({
  vertexShader: `...glsl...`,
  fragmentShader: `...glsl...`,
  uniforms: {
    uTime:  { value: 0 },
    uColor: { value: new THREE.Color('#44aaff') },
  },
  transparent: true,
})

// Update uniforms each frame
useFrame(({ clock }) => {
  mat.uniforms.uTime.value = clock.getElapsedTime()
})

// Render it
<mesh>
  <sphereGeometry args={[1, 32, 24]} />
  <primitive object={mat} attach="material" />
</mesh>
```

`ShaderMaterial` automatically injects Three.js matrices (`projectionMatrix`, `modelViewMatrix`, `normalMatrix`) into your shaders — no need to declare them.

### The Fresnel effect

Fresnel describes how reflectivity increases at grazing angles. In a shader:

```glsl
// vNormal: surface normal (view space)
// vViewDir: direction from vertex toward camera

float facing  = max(0.0, dot(vNormal, vViewDir));
float fresnel = pow(1.0 - facing, power);
// → 0 when surface faces camera directly (dark center)
// → 1 when surface is edge-on to camera (bright rim)
```

Used for: selection highlights, force fields, energy shields, holographic displays, atmospheric scattering at horizon.

### Vertex displacement (wind grass)

The vertex shader can displace geometry — no extra polygons needed:

```glsl
// Grass wind shader vertex shader
vec4 worldPos = modelMatrix * vec4(position, 1.0);
float windPhase = worldPos.x * uWindFrequency + uTime * 1.8;
float sway = sin(windPhase) * uWindStrength;

// uv.y = 0 at base, 1 at tip
// Quadratic factor: base stays planted, tip swings fully
float bendFactor = uv.y * uv.y;

pos.x += sway * bendFactor;
```

The key insight: multiply the displacement by `uv.y` (height along the blade). The base (uv.y=0) doesn't move. The tip (uv.y=1) swings fully. This is a **root-anchored bend** — the blade curves rather than translates.

### Hologram scanlines

```glsl
// Horizontal scanlines scrolling upward
float scanY    = fract(vUv.y * 38.0 - uTime * 0.4);
float scanline = step(0.55, scanY) * 0.35;

// Grid lines with anti-aliased edges using fwidth()
float gridY = abs(fract(vUv.y * 8.0 - 0.5) - 0.5);
float lineY = 1.0 - smoothstep(0.0, fwidth(vUv.y * 8.0) * 1.5, gridY);
```

`fract(x)` = x − floor(x) → the fractional part, always in [0,1). Applied to scrolling UVs, it creates repeating bands. `fwidth()` returns the screen-space rate of change of a value — used for anti-aliased line edges that don't jagg at different zoom levels.

### Additive blending

```js
blending: THREE.AdditiveBlending
```

Instead of the normal "src overrides dst" blending, additive blending **adds** the fragment color to what's already there. Bright areas intensify the underlying scene. This is the correct blending mode for glows, fire, energy effects, and anything that should feel like emitted light rather than opaque paint.

### Projects to build with custom shaders

| Effect | Key technique |
|---|---|
| Fresnel/rim light | `pow(1 - dot(N, V), power)` |
| Holographic display | Scanlines + grid + flicker uniforms |
| Wind grass | Vertex displacement × height factor |
| Lava floor | FBM noise in GLSL + scrolling UVs + palette |
| Portal effect | UV distortion + color swirl |
| Cel shading | `floor(diffuse × bands) / bands` — discretizes the lighting |
| Rain/glass | Two-layer normal map scroll for refraction |

---

## Files added in Phase 6

| File | Purpose |
|---|---|
| `src/components/GLTFModel.jsx` | Generic GLTF loader with Suspense + error fallback |
| `src/systems/AnimationStateMachine.js` | Blend-weight state machine for animation transitions |
| `src/components/InstancedForest.jsx` | 50 trees in 3 draw calls (replaces Trees.jsx) |
| `src/components/InstancedRocks.jsx` | 30 rocks in 1 draw call (replaces Rocks.jsx) |
| `src/shaders/shaders.js` | Fresnel, hologram, wind grass, lava GLSL shader strings |
| `src/components/GlowOrb.jsx` | Custom Fresnel shader orb with point light |
| `src/components/GrassField.jsx` | 2,000 instanced blades + wind vertex shader |
| `public/models/README.md` | Instructions for adding GLTF model files |

---

## Performance summary

| Feature | Draw calls before | Draw calls after | CPU/frame |
|---|---|---|---|
| Trees (50 trees, 3 mesh types) | 24 (8 trees × 3) | **3** | matrix update × 100/frame |
| Rocks (30 rocks) | 5 | **1** | none (static) |
| Grass (2,000 blades) | N/A | **1** | 1 uniform write |
| Glow orbs (3) | N/A | **3** | 1 uniform write each |
| Human walk blend | N/A | 0 (CPU ref mutation) | FSM update + ref mutation |
