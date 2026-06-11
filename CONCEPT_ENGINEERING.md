# Engineering Concepts: 3D Simulator
### A Tailored Deep-Dive for Timothy Grant

---

## Executive Overview

This project is a complete, real-time 3D game engine built entirely inside a web browser — no Unity, no Unreal, no native runtime. The stack is React Three Fiber (R3F) on top of Three.js, with Zustand for global state and Vite as the build pipeline. It runs at 60 frames per second, has a first-person player with physics, collision, stamina, a day/night cycle, GPU-instanced forests, custom GLSL shaders, procedurally generated terrain, spatial audio, save/load persistence, and an NPC dialogue system.

What makes this project architecturally interesting is not any one feature — it's how every feature was built to avoid the central constraint of real-time 3D: **you have ~16ms per frame and the CPU must not become the bottleneck.** Every design decision traces back to that constraint.

---

## Your Personal Mindset Shift

You come from C#, .NET, Python, and Embedded C. This is an exceptionally useful background — not a liability. But the mental models you've built for "how programs execute" will need one significant extension before this architecture becomes intuitive.

### The Model You're Used To

In C# or a backend Python service, execution is **request-driven or event-driven at the framework level**. A function is called, it runs to completion, it returns. The framework manages the event loop for you. You write handlers; the runtime calls them. In embedded C, you're closer to the metal — maybe you have an ISR (interrupt service routine), a main polling loop, or an RTOS scheduler — but you're still thinking in terms of "a thing happened, now I respond."

Concurrency in your world means: **multiple things happening at indeterminate times**, managed via threads, async/await, callbacks, or hardware interrupts. The "hard part" is synchronization — making sure two things don't touch the same memory simultaneously.

### The Model You're Entering

In a real-time game engine, execution is **frame-driven**. There is one loop. It runs as fast as the hardware allows (targeting 60Hz). Every frame, the engine:

1. Reads all input
2. Updates all state (physics, AI, animation, audio)
3. Renders the entire 3D scene
4. Waits for the next frame

This is **not async**. There is no thread for physics and another for rendering. Everything happens in sequence, on the main thread, within 16.67ms. "Concurrency" is not the problem here. **Budget** is the problem. You have 16ms. Physics gets some of it. Rendering gets most of it. You get what's left.

The consequence: **you do not allocate memory in the hot path.** You do not create objects inside the loop. You do not trigger framework re-renders if you can avoid it. You maintain pre-allocated structures and mutate them in place.

If you've done embedded work where you avoided `malloc()` in ISRs and reused static buffers — that instinct is exactly right here. The difference is scale: instead of bytes on a microcontroller, you're managing megabytes of GPU memory and thousands of JavaScript operations per millisecond.

This project demonstrates this shift beautifully. Stamina is computed in a `useRef` (a mutable container, never triggers re-render) and only pushed to the React state store 20 times per second. The terrain height function is a pure mathematical computation with no memory allocation. Instance matrices are written directly into a `Float32Array` on the GPU. These are not performance micro-optimizations — they're the architectural vocabulary of real-time systems.

---

## Deep-Dive Modules

---

### Module 1: The Game Loop — `useFrame`, Delta Time, and Tick-Based Simulation

**The "Why"**

A web browser's animation system is event-driven. `requestAnimationFrame` calls your function "when the browser is ready to paint the next frame" — roughly 60 times per second on a 60Hz display. React Three Fiber wraps this into `useFrame`, a hook that runs a callback inside the Three.js render loop every frame.

The problem: frames don't arrive at perfectly regular intervals. A frame might take 14ms, then 18ms, then 16ms. If you move a character 1 unit per frame, they'll move at different speeds on different machines and different loads. A 30fps machine gets half the frames, so the character moves half as far.

**The Theory: Delta-Time Integration**

The solution is **delta-time integration**. Every frame, `useFrame` provides `delta` — the elapsed time in seconds since the last frame. You multiply all quantities by `delta` so they're expressed in "units per second" rather than "units per frame."

```
position += speed * delta   // "7 units per second", regardless of framerate
```

This is the same principle as numerical integration in physics simulations: Euler's method, where you approximate the next state by stepping along the derivative. The derivative here is velocity (units/second), and `delta` is the time step.

**The Implementation**

In `Player.jsx`, nearly every quantity uses this pattern:

```js
// In useFrame((_, delta) => { ... })
staminaRef.current += (sprintActive ? -STAMINA_DRAIN_RATE : STAMINA_REGEN_RATE) * delta

velocityY.current -= GRAVITY * delta         // gravity: 22 units/s²
camera.position.y += velocityY.current * delta
```

`GRAVITY = 22` doesn't mean "22 units per frame." It means "22 units per second per second" — an acceleration. The velocity is integrated from the acceleration, and the position is integrated from the velocity. Two Euler steps. This is the same math as a physics engine, just manually implemented because this project doesn't use a physics library.

**The Consequence for You**

Coming from C# or Python, you're used to `Thread.Sleep(16)` or `asyncio` delays to control timing. In a game loop, **time is a parameter, not a controller.** You don't sleep to control speed — you read `delta` and multiply by it. This is a fundamental mental model shift: instead of "I wait for time to pass," you "I observe how much time passed and compute accordingly."

---

### Module 2: Zustand — Global State Without React's Re-render Tax

**The "Why"**

React's built-in state (`useState`) triggers a re-render of every component that subscribes to it whenever the value changes. In a UI application that responds to user gestures once every few hundred milliseconds, this is fine. In a 60fps game loop, it's catastrophic. If stamina updated 60 times per second in a `useState`, every component reading stamina would re-render 60 times per second — including the HUD bar, the overlay, and anything else in the tree.

**The Theory: Atomic External Stores with Selector Subscriptions**

Zustand is a tiny (~1KB) state manager that lives **outside the React component tree**. It's a plain JavaScript object that notifies subscribers when slices of state change. The key architectural feature is **selector-based subscriptions**: a component only re-renders when the exact slice of state it selected actually changes.

```js
// ✅ Only re-renders when health changes — nothing else
const health = useGameStore(state => state.health)

// ❌ Re-renders on ANY store change
const store = useGameStore()
```

The second pattern is what React's `useContext` forces you into — the whole context, the whole re-render. Zustand's selector pattern makes subscriptions **surgical**.

This project has two stores deliberately kept separate:

| Store | Domain | Who reads it |
|---|---|---|
| `useGameStore` | Player: health, stamina, inventory, camera yaw | HUD, Overlay, Player |
| `useWorldStore` | World: interacted NPCs, discovered areas, collected items | NPC, Level, saveLoad |

The separation isn't just organizational — it's a subscription boundary. The HUD subscribing to `useGameStore` will never re-render because an NPC was interacted with (that's `useWorldStore`). Without the split, any world event would cascade through all player-UI subscribers.

**The Implementation**

The store in `useGameStore.js` uses a pattern you'll see in backend services too: **actions co-located with state**. `takeDamage`, `heal`, `pickUpItem` are defined as functions inside the store creator — they have access to `set` (to update state) and `get` (to read current state without subscribing). This means components don't implement business logic; they call store actions.

There's one more critical pattern: **reading store state imperatively outside components** to avoid creating subscriptions in hot paths:

```js
// In Player.jsx useFrame — does NOT create a subscription
const state = useInteractionStore.getState()
if (!state.activeDialogue) return
```

`getState()` is a snapshot read with zero subscription overhead. This is the pattern for reading store state inside `useFrame` — never hook calls inside the game loop, only direct state access via `getState()`.

**The Analogy**

In your .NET background: Zustand is like a singleton service with `INotifyPropertyChanged` where each subscriber is bound to a specific property getter — except the notification granularity is per-selector, not per-property, and it's built into React's rendering model. The `set(state => ({ ... }))` pattern is analogous to a command pattern where the update function receives the current state and returns a patch.

---

### Module 3: Refs as Private Stack Variables — The Performance Pattern

**The "Why"**

This is the single most important performance pattern in the entire codebase, and it's one you'll encounter in every serious React Three Fiber project.

**The Theory**

In React, `useState` stores values in the component's fiber and **causes re-renders when they change**. `useRef` stores a mutable value in `ref.current` that **never causes re-renders when mutated**. It's just a box with a `.current` property — plain JavaScript mutation.

In a game loop, you often have values that:
1. Change every frame (60Hz)
2. Must be read accurately every frame
3. Should not trigger UI re-renders every frame

These values should live in refs. They are "hot path state." When they need to be reflected in the UI, they're synced to the Zustand store at a throttled rate.

**The Implementation**

`Player.jsx` demonstrates this pattern precisely for stamina:

```js
// Ref: updated every frame by the game loop — no re-render
const staminaRef = useRef(100)

// useFrame (60Hz):
staminaRef.current += (sprintActive ? -STAMINA_DRAIN_RATE : STAMINA_REGEN_RATE) * delta

// Only sync to Zustand at 20Hz
staminaSyncAccum.current += delta
if (staminaSyncAccum.current >= 0.05) {           // 50ms = 20Hz
    setStamina(staminaRef.current, isExhaustedRef.current)
    staminaSyncAccum.current = 0
}
```

The stamina bar in the HUD re-renders at most 20 times per second — not 60. The physics simulation sees stamina at full 60Hz precision. The UI is throttled. Both requirements are satisfied simultaneously.

The same pattern drives the compass: `camera.rotation.y` is read directly in the Three.js scene every frame (a live object mutation, no React involved), then synced to the store at 20Hz via `CameraSync` in `App.jsx`.

**The Analogy**

In embedded C, you'd distinguish between a variable that's read by an ISR (must be `volatile`, updated at interrupt frequency) and the same variable exposed to a slower polling display (read at 10Hz, good enough for the UI). The ref is the volatile variable. The store is the display-rate snapshot. This project implements exactly that two-tier update architecture, using JavaScript's object mutation model instead of hardware memory semantics.

---

### Module 4: AABB Collision — The Core Physics Primitive

**The "Why"**

The world needs walls. If the player walks into a building, they should be stopped — or better, slide along the wall. This project does not use a physics engine library (like Rapier or Cannon.js). It implements the simplest possible physics primitive by hand: the Axis-Aligned Bounding Box (AABB).

**The Theory**

An AABB is a box whose faces are exactly parallel to the world X, Y, Z axes. "Axis-aligned" means it doesn't rotate — no diagonal faces. This constraint makes intersection testing trivially cheap:

Two AABBs overlap if and only if they overlap on **all three axes simultaneously**:

$$\text{overlap} = (a_{minX} < b_{maxX}) \wedge (a_{maxX} > b_{minX}) \wedge (a_{minZ} < b_{maxZ}) \wedge (a_{maxZ} > b_{minZ})$$

If any axis has a gap, the boxes don't touch. You need only six comparisons. This test runs in $O(n)$ time over $n$ colliders — acceptable for a small world with ~20 buildings.

**Axis-Separated Slide Resolution**

Stopping the player completely when they hit any wall feels bad. Real walls let you slide along them. The trick is to decompose the movement into axes and test each independently:

```
1. Try (newX, oldZ)  → if clear, accept X movement; else revert X
2. Try (resolvedX, newZ) → if clear, accept Z movement; else revert Z
```

If you're walking into the corner of a building at a diagonal, X might fail but Z might pass — so you slide south instead of stopping dead. This is "wall sliding" and it's implemented in ~20 lines in `systems/collision.js`.

**The Implementation**

```js
// collision.js — the entire algorithm
export function resolveXZ(newX, newZ, oldX, oldZ, colliders) {
    const resolvedX = overlapsAny(newX, oldZ, colliders) ? oldX : newX
    const resolvedZ = overlapsAny(resolvedX, newZ, colliders) ? oldZ : newZ
    return { x: resolvedX, z: resolvedZ }
}
```

This is called in `Player.jsx` after every movement update, before the camera position is committed. The `WORLD_COLLIDERS` array in `data/colliders.js` is a static list of `{ minX, maxX, minZ, maxZ }` boxes matching the building positions.

**What This Doesn't Handle**

AABBs are great for simple rectangular environments but fail for arbitrary shapes. Diagonal walls, curved corridors, sloped floors — these require more sophisticated collision shapes (OBBs, capsules, convex hulls, or mesh colliders). For a block-grid world like this one, AABBs are the correct engineering choice: maximum simplicity, zero dependencies, adequate accuracy.

---

### Module 5: Procedural Terrain — FBM, Value Noise, and Deterministic Geometry

**The "Why"**

The terrain needs to look natural — hills, valleys, gentle slopes — without being hand-authored. More importantly, the terrain must be **deterministic**: given the same $(x, z)$ coordinate, `getTerrainHeight(x, z)` must always return the same Y value, because both the renderer (to build the mesh) and the physics (to snap the player to ground) call it independently. There is no separate "physics mesh" — the rendering IS the physics.

**The Theory: Value Noise and Fractional Brownian Motion**

Natural-looking random surfaces require two properties:
- **Continuity**: nearby points should have similar heights (no jagged jumps)
- **Scale independence**: the terrain should have both large hills and small bumps

Value Noise achieves continuity by: (1) assigning a random value to each integer grid point via a hash function, (2) using bilinear interpolation with **smoothstep** to blend between adjacent grid points.

Smoothstep is the polynomial $3t^2 - 2t^3$, which maps $[0,1] \to [0,1]$ with zero derivative at both endpoints. This means the blended surface has no kinks at grid boundaries — it's $C^1$ continuous (smooth, with continuous first derivative).

Fractional Brownian Motion (FBM) stacks multiple octaves of noise at increasing frequencies and decreasing amplitudes:

$$h(x,z) = \sum_{i} A_i \cdot \text{noise}\left(x \cdot f_i,\, z \cdot f_i\right)$$

In `terrain.js`:

| Octave | Scale $f_i$ | Amplitude $A_i$ | Effect |
|--------|-------------|-----------------|--------|
| 1 | 0.007 | 4.5 units | Large rolling hills |
| 2 | 0.022 | 1.4 units | Medium undulation |
| 3 | 0.070 | 0.40 units | Surface bumps |
| 4 | 0.190 | 0.10 units | Fine grain |

Higher frequency = more frequent variation. Lower amplitude = smaller contribution. The sum looks like mountains because real-world terrain has exactly this fractal structure across many scales.

**Spawn Flattening**

Buildings and the player spawn near the origin. A bumpy spawn zone would cause buildings to clip underground and the player to start tilted. The solution: multiply the noise output by a radial smoothstep that is 0 at the origin and rises to 1 at radius 52 units:

```js
const t  = Math.min(1, dist / FLAT_RADIUS)
const st = t * t * (3 - 2 * t)   // smoothstep
return h * st
```

The flat disc is a smooth blend, not a hard disc edge — the terrain transitions imperceptibly from flat to hilly.

**The Consequence**

Because `getTerrainHeight` is a pure mathematical function (same input → same output, no state, no allocations), it can be called from anywhere: at startup to build the mesh, at runtime to snap objects to the ground, at save time to store positions. This "single source of truth as a pure function" is a recurring pattern in game engines and is directly analogous to a deterministic hash in distributed systems — you can recompute the answer anywhere, anytime, from the same inputs.

---

### Module 6: GPU Instancing — Draw Calls and the CPU→GPU Bandwidth Bottleneck

**The "Why"**

This is where real-time graphics engineering diverges most sharply from general software engineering, and where the biggest performance gains live.

**The Theory: The Draw Call Problem**

A "draw call" is a single CPU instruction to the GPU: "render this mesh, with this material, at this transform." Every draw call has fixed overhead: the CPU validates state, packs a command buffer, submits it to the GPU driver, and waits for acknowledgment. This overhead is roughly constant — 50–200 microseconds per call regardless of how many triangles the mesh has.

For a forest of 500 trees × 3 mesh parts (trunk, main canopy, secondary canopy) = **1,500 draw calls** per frame. At 60fps, that's 90,000 draw calls per second. Modern GPUs can execute billions of triangles per second but can only process ~1,000–3,000 draw calls per frame before the **CPU** becomes the bottleneck. The GPU sits idle, waiting for the CPU to issue commands.

**The Solution: InstancedMesh**

`THREE.InstancedMesh(geometry, material, count)` tells the GPU: "render `count` copies of this geometry in **one draw call**, using per-instance transform matrices I'll provide." The GPU handles the instancing internally.

The data sent to the GPU:
- 1 vertex buffer (the shared mesh shape, once)
- 1 material (shader + textures, once)
- A `Float32Array` of $count \times 16$ floats (each instance's 4×4 transform matrix)

50 trees × 3 mesh types = **3 draw calls** instead of 150.

**The Implementation**

```js
// InstancedForest.jsx — setting up 50 trunk instances
const dummy = new THREE.Object3D()   // a throwaway object to build matrices

treeData.forEach(({ x, y, z, scale }, i) => {
    dummy.position.set(x, y + 0.9 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.updateMatrix()
    trunkRef.current.setMatrixAt(i, dummy.matrix)
})
trunkRef.current.instanceMatrix.needsUpdate = true
```

The `.needsUpdate = true` flag tells Three.js to re-upload the matrix buffer to the GPU on the next frame. This is explicit cache invalidation — the GPU has its own copy of the data, and you must signal when your CPU-side copy has changed.

Wind sway is applied by rebuilding canopy matrices each frame with a sine-based rotation offset, per instance, with per-tree random phase and frequency so they don't all sway identically.

**Per-Instance Color**

`setColorAt(i, color)` uploads per-instance RGB tints alongside the matrices. The material shader multiplies this tint with the base texture color. 50 different shades of green, zero extra draw calls, zero extra materials.

**The Deeper Principle**

The GPU is not a faster CPU — it's a massively parallel execution engine optimized for large, uniform batches of identical work. The CPU issues work; the GPU executes it in parallel across thousands of shader cores. Instancing exploits this: "do exactly this same computation 50 times with different input matrices" is precisely the kind of work a GPU is designed for. Issuing 50 separate draw calls, each with slightly different state, defeats the parallelism and bottlenecks on the sequential CPU command submission path.

This principle extends beyond graphics: batch processing, SIMD operations, and vectorized operations in NumPy/pandas are all the same pattern — transforming sequential one-at-a-time work into parallel many-at-once work.

---

### Module 7: Custom GLSL Shaders — Writing Code That Executes on the GPU

**The "Why"**

Some visual effects cannot be achieved with standard materials: a glowing energy orb with rim lighting, grass that bends in the wind without CPU work, a holographic surface with scanlines. These require **custom shader programs** written in GLSL (OpenGL Shading Language), a C-like language compiled and executed directly on the GPU.

**The Theory: The GPU Pipeline**

For every mesh, the GPU runs two programs in sequence:

**Vertex Shader** — executes once per vertex (corner of a triangle).
- Input: the vertex's local-space position, normal vector, and UV coordinate
- Output: `gl_Position` — the vertex's location on screen in clip space
- Can pass additional data to the fragment shader via `varying` variables

**Fragment Shader** — executes once per pixel covered by the triangle.
- Input: interpolated `varying` values from the surrounding vertices
- Output: `gl_FragColor` — the RGBA color of this pixel

The GPU runs these programs on thousands of cores in parallel. A fragment shader covering 1,000,000 pixels fires 1,000,000 shader invocations simultaneously (subject to hardware limits). This is why "expensive shader math" is often acceptable — you're paying for compute once, amortized over massive parallelism.

**Variable Types**

| Type | Scope | Direction | Example |
|------|-------|-----------|---------|
| `uniform` | Set from JavaScript | CPU → all shader invocations | `uTime`, `uColor` |
| `attribute` | Per-vertex geometry data | GPU buffer → vertex shader | `position`, `normal`, `uv` |
| `varying` | Per-vertex, interpolated | Vertex → fragment | `vNormal`, `vUv` |

**The Fresnel Effect**

The glow orbs use a Fresnel shader. Fresnel describes a physical optics phenomenon: surfaces reflect more light at grazing angles than at direct angles. A window is transparent face-on but mirror-like at a shallow angle.

The shader formula:

```glsl
float facing  = max(0.0, dot(vNormal, vViewDir));  // 1 = face-on, 0 = edge-on
float fresnel = pow(1.0 - facing, uPower);          // 0 at center, 1 at rim
```

`dot(N, V)` is the cosine of the angle between the surface normal and the view direction — a fundamental dot product from linear algebra. Taking `1 - dot(N,V)` inverts it: 0 when facing the camera, 1 when edge-on. `pow(..., uPower)` sharpens the rim by controlling how quickly the value falls off toward the center. Higher power = tighter, sharper rim.

**The Wind Grass Vertex Shader**

Vertex displacement is a technique where you move vertices in the vertex shader — deforming the mesh geometry on the GPU without touching the CPU or the mesh data:

```glsl
// grassVertexShader in shaders.js
float bendFactor = uv.y * uv.y;   // 0 at base, 1 at tip (quadratic)
pos.x += sway * uWindStrength * bendFactor;
```

`uv.y` is 0 at the base of the blade and 1 at the tip. Multiplying displacement by this value anchors the base while allowing the tip to move freely. Using `uv.y * uv.y` (quadratic) creates more natural bending — barely moving near the base, sweeping wide at the tip.

After the initial matrix setup, **zero CPU work is required per frame**. The wind simulation runs entirely on the GPU, in parallel, across all 2,000 grass blade vertices, every frame. This is the canonical use case for vertex shaders: animated geometry that would be prohibitively expensive if computed on the CPU.

**The FBM Noise Shader (Lava)**

The lava shader reconstructs the same FBM algorithm from `terrain.js` but runs it in GLSL inside the fragment shader. This means each of the millions of pixels on the lava surface gets a unique noise evaluation — producing a continuously animated molten texture with moving "hot cores" and cooler channels, driven only by `uTime`. No texture uploads. No CPU computation. Pure GPU math.

---

### Module 8: Animation State Machines — Crossfade Blending

**The "Why"**

The NPC human character has three animation states: idle, walk, and run. Naively switching between them — "if moving, use walk pose; else use idle pose" — produces a jarring snap. Real characters blend smoothly between motion states. This is exactly what Unity's Animator and Unreal's Animation Blueprint do. This project implements the same core mechanism by hand.

**The Theory**

An animation state machine tracks:
- `current` — the state we're transitioning **to**
- `previous` — the state we're transitioning **from**
- `weight` — a scalar in [0, 1]. At 0: fully in `previous`. At 1: fully in `current`.

Each frame, `weight` advances toward 1.0 at `blendSpeed` per second. During a transition, **both** animations run simultaneously and are linearly interpolated:

$$\text{poseValue} = \text{getWeight(IDLE)} \times \text{idleValue} + \text{getWeight(WALK)} \times \text{walkValue}$$

`getWeight(state)` returns the state's current blend contribution:
- If it's `current`: return `weight` (0 → 1 as transition progresses)
- If it's `previous`: return `1 - weight` (1 → 0 as transition progresses)
- Otherwise: return 0

**The Implementation**

```js
// AnimationStateMachine.js — the entire state machine
setState(newState) {
    if (newState === this.current) return   // no-op if already in this state
    this.previous = this.current
    this.current  = newState
    this.weight   = 0.0                    // restart transition from 0
}

getWeight(state) {
    if (state === this.current)  return this.weight
    if (state === this.previous) return 1.0 - this.weight
    return 0.0
}
```

This pattern scales effortlessly: regardless of how many body parts the character has (arms, legs, torso, head), they all read from the same two `getWeight` calls. The blend math is applied uniformly.

**The Analogy**

This is a two-state crossfade — the same pattern used in audio DAWs (crossfading between tracks), video editors (dissolve transitions), and UI animation frameworks (interpolating between states). The state machine is an abstraction over "from" and "to" states plus a normalized time parameter. If you've written a UI animation with a `t` value going from 0 to 1 over time, you've already implemented the core of this system.

---

### Module 9: Raycasting — Picking Objects in 3D Space

**The "Why"**

When the player looks at an NPC and presses E, the game needs to know: "what 3D object is the crosshair pointing at?" This is the **object picking** problem. In 3D space, "what the camera sees at the center of the screen" is determined by casting a ray from the camera through that screen position and finding the first intersection with scene geometry.

**The Theory**

The screen center in Normalized Device Coordinates (NDC) is `(0, 0)` — a coordinate system where the screen spans `[-1, 1]` on both axes, independent of resolution. Three.js's `raycaster.setFromCamera({ x: 0, y: 0 }, camera)` performs **unprojection**: it applies the camera's inverse view-projection matrix to the NDC point, producing a ray origin (the camera position) and direction (the camera's forward vector at that pixel). This is the mathematical inverse of rendering — projection transforms 3D → 2D; unprojection reverses 2D → 3D.

The ray is then tested against a list of scene objects: `raycaster.intersectObjects(interactableObjects, true)`. Three.js computes ray-triangle intersections for every triangle in every target mesh and returns hits sorted by distance. You take `hits[0]` — the closest — and check if it's within `INTERACTION_RANGE = 3.0` units.

**Performance: Opt-In Interactable Lists**

Raycasting against the entire scene every frame — thousands of triangles for terrain, trees, buildings — would be expensive. The solution: maintain an explicit list of "interactable objects" (NPCs, pickup items). Raycasting is only run against this small list. The `interactables.js` system manages registration and lookup.

**The Implementation**

```js
// useRaycast.js
raycaster.setFromCamera({ x: 0, y: 0 }, camera)    // NDC center → ray
const hits = raycaster.intersectObjects(interactableObjects, true)

if (hits.length > 0 && hits[0].distance <= INTERACTION_RANGE) {
    const found = findInteractableByHit(hits[0].object)
    if (found) setLookingAt({ id: found.id, name: found.meta.name })
}
```

The result is stored in `useInteractionStore`. The NPC component reads it to decide whether to show a highlight ring. The Player component reads it to decide whether to open dialogue on E press. The raycasting logic is decoupled from both the visual response and the interaction handling — a clean separation of concerns.

---

### Module 10: The Canvas Bridge Pattern

**The "Why"**

React Three Fiber's `Canvas` creates an isolated render context — a WebGL canvas with its own Three.js scene, renderer, and camera. Code inside `Canvas` has access to Three.js objects via hooks (`useThree`, `useFrame`). Code outside `Canvas` — the regular React DOM — has no direct access to the Three.js scene. But they need to communicate: the compass needs the camera's yaw, the game loop needs to trigger pointer lock on the DOM canvas, the debug panel needs to teleport the camera.

**The Theory**

The solution is "bridge components" — React components that live **inside Canvas** (so they have Three.js access) but communicate **outward** via Zustand stores, refs, or callbacks passed as props.

**The Implementations in App.jsx**

| Bridge | Lives inside Canvas | Communicates outward via |
|--------|---------------------|--------------------------|
| `LockBridge` | Yes | `onReady(fn)` callback → `lockFn` ref in App |
| `CameraSync` | Yes | `setCameraYaw` and `savePosition` → Zustand stores |
| `AudioBridge` | Yes | Web Audio API listener position (external side effect) |
| `FogSync` | Yes | Reads `teleportRef` from App; reads `useDebugStore` directly |

```js
// CameraSync — the minimal bridge for compass data
function CameraSync() {
    const { camera }   = useThree()         // Three.js access: inside Canvas
    const setCameraYaw = useGameStore(state => state.setCameraYaw)  // Zustand
    const accumRef     = useRef(0)

    useFrame((_, delta) => {
        accumRef.current += delta
        if (accumRef.current >= 0.05) {     // 20Hz throttle
            setCameraYaw(camera.rotation.y)  // push to store → DOM compass re-renders
            accumRef.current = 0
        }
    })
    return null    // renders nothing — pure logic
}
```

**The Broader Pattern**

This "bridge" pattern appears throughout systems programming when two execution contexts with different APIs must share data. In embedded systems, a bridge might convert between I2C and SPI protocols. In microservices, it's an adapter translating between API schemas. In React Three Fiber, the bridge translates between Three.js's mutable scene objects (which live in the WebGL context) and React's declarative component tree. The bridge component lives at the boundary, speaks both languages, and keeps each side unaware of the other's internals.

---

## Mental Sandbox & Next Steps

These are not exercises to complete — they're problems to **think through**, designed to stretch the architectural intuitions you're building.

**1. The Ref-Store Boundary**

Currently, `staminaRef` lives in `Player.jsx` because only the game loop writes to it. What if you added a "poison debuff" system where an NPC could drain stamina from outside `Player.jsx`? Where would you put the stamina ref? Should it move into the store? What would you lose (performance) and gain (accessibility)? What pattern could let you keep performance while allowing external writes?

**2. Spatial Partitioning for Collision**

The current `overlapsAny()` in `collision.js` runs in $O(n)$ — it tests the player against all $n$ colliders every frame. For a small world (n~20), this is fine. If you wanted 200 buildings, you'd need to cull the test set. Design a spatial grid (divide the world into cells, put each collider in the cells it overlaps, only test cells near the player). What data structure would you use? When would you rebuild it? How does this relate to database spatial indexes?

**3. GPU-Side Wind vs. CPU-Side Wind**

`InstancedForest.jsx` computes wind sway on the CPU (50 `setMatrixAt` calls per frame). `GrassField` computes it in the vertex shader (zero CPU work). The grass comment notes: "For 10,000+ instances you'd move this to a shader." Design the shader approach for the forest trees. What data would you need to send as uniforms? What would you need to encode per-instance to give each tree a unique phase? How would the vertex shader know each instance's base position to compute world-space wind phase?

---

*Document generated by `/teachme` — tailored to Timothy Grant's background in C#/.NET/Python/Embedded C, targeting advanced systems engineering fluency.*
