# Engineering Concepts: Building a 3D First-Person World in the Browser

> **Who this is for:** Engineers who have written linear programs — scripts that run top to bottom, C programs that `scanf` and `printf`, Python scripts that process files — and who want to understand how a real-time interactive 3D application actually works. We will build your mental model from the ground up. Nothing will be hand-waved.

---

## Table of Contents

1. [The Great Paradigm Shift: From Linear to Event-Driven](#1-the-great-paradigm-shift)
2. [The Browser as a Runtime Environment](#2-the-browser-as-a-runtime-environment)
3. [The Game Loop and requestAnimationFrame](#3-the-game-loop-and-requestanimationframe)
4. [JavaScript Concepts You Need](#4-javascript-concepts-you-need)
5. [The GPU and WebGL](#5-the-gpu-and-webgl)
6. [Three.js: The 3D Engine](#6-threejs-the-3d-engine)
7. [3D Coordinate Systems](#7-3d-coordinate-systems)
8. [Vectors and Vector Mathematics](#8-vectors-and-vector-mathematics)
9. [The Scene Graph](#9-the-scene-graph)
10. [Geometry: Describing Shape with Triangles](#10-geometry-describing-shape-with-triangles)
11. [Materials: Describing Surface Appearance](#11-materials-describing-surface-appearance)
12. [Lighting and Shading Models](#12-lighting-and-shading-models)
13. [The Camera and Projection Mathematics](#13-the-camera-and-projection-mathematics)
14. [Transformations: Position, Rotation, and Scale](#14-transformations-position-rotation-and-scale)
15. [Euler Angles and Quaternions](#15-euler-angles-and-quaternions)
16. [The Renderer: Bringing It All Together](#16-the-renderer-bringing-it-all-together)
17. [Fog: Atmospheric Depth](#17-fog-atmospheric-depth)
18. [Shadow Mapping](#18-shadow-mapping)
19. [The Pointer Lock API: Capturing the Mouse](#19-the-pointer-lock-api-capturing-the-mouse)
20. [Event-Driven Input: Keyboard State Tracking](#20-event-driven-input-keyboard-state-tracking)
21. [Delta Time: Frame-Rate Independent Movement](#21-delta-time-frame-rate-independent-movement)
22. [Camera Space vs World Space](#22-camera-space-vs-world-space)
23. [Head Bobbing: Sinusoidal Animation](#23-head-bobbing-sinusoidal-animation)
24. [Performance and the Rendering Pipeline](#24-performance-and-the-rendering-pipeline)
25. [What Comes Next](#25-what-comes-next)

---

## 1. The Great Paradigm Shift

This is the single most important thing to understand before anything else.

### Linear programs: you are in control of time

When you write a C program:

```c
int main() {
    int x = read_sensor();
    int y = compute(x);
    printf("%d\n", y);
    return 0;
}
```

Your program owns time completely. It runs, does its work, and exits. The operating system gives it the CPU, it executes instructions in order, and it terminates. You decide when every line runs. There is a beginning, a middle, and an end.

Even a loop like this:

```c
while (1) {
    data = read_input();
    process(data);
}
```

…is still linear thinking. You are polling. You are spinning. You decide to check for input on every iteration. Time is yours.

### Event-driven programs: the runtime is in control of time

A browser game works completely differently. You do not own time. Instead:

1. You **register functions** to be called when things happen.
2. The browser's **event loop** decides when to call them.
3. Your code runs in **short bursts**, then yields control back to the browser.
4. You never block. You never spin. You never wait.

Think of it like being a contractor hired by a building. You don't live in the building — you register your phone number with the front desk and say "call me when the fire alarm goes off." When the alarm fires, the front desk calls you, you do your job, and you leave. The building keeps running whether you're there or not.

In our game, we register three types of callbacks:

- **`requestAnimationFrame`** — "call me every time the browser is about to paint a frame"
- **`addEventListener('mousemove', ...)`** — "call me when the mouse moves"
- **`addEventListener('keydown', ...)`** — "call me when a key is pressed"

Our code never sits and waits. It is called, runs for a millisecond or two, and exits. The browser handles everything else.

### Why this matters for 3D

A 3D game runs at 60 frames per second. That means you have **16.67 milliseconds** to do everything for one frame: read input, update positions, calculate physics, and tell the GPU to draw the world. If you take longer than that, the frame is late and the game stutters. This is why you cannot block, cannot do slow synchronous I/O, and must think in terms of "what needs to happen this frame."

---

## 2. The Browser as a Runtime Environment

### What the browser actually is

A browser is not just a document viewer. It is a full application runtime with:

- **A JavaScript engine** (V8 in Chrome, SpiderMonkey in Firefox) — compiles and executes your JS
- **A rendering engine** (Blink, Gecko) — turns HTML/CSS into pixels
- **A GPU compositor** — hands off paint commands to the graphics card
- **A networking stack** — handles HTTP, WebSockets, etc.
- **An audio engine** — Web Audio API
- **An event loop** — the scheduler that orchestrates everything

### The event loop

The event loop is the heartbeat of the browser. Conceptually, it looks like this:

```
while (true) {
    task = dequeue_next_task();       // e.g., a timer, I/O callback
    execute(task);
    
    for each microtask in queue:      // Promises resolve here
        execute(microtask);
    
    if (time_to_paint_a_frame):
        run_animation_frame_callbacks();
        composite_and_paint_to_screen();
}
```

Your JavaScript always runs inside one of those "execute(task)" slots. This is why JavaScript is called **single-threaded**: only one piece of JS runs at a time. There is no parallelism in the main thread. (Web Workers give you background threads, but that's separate.)

### The DOM

The DOM (Document Object Model) is the browser's in-memory tree representation of the HTML page. Every `<div>`, `<canvas>`, `<button>` etc. is a node in this tree. JavaScript can read and modify it. When Three.js creates its renderer, it creates a `<canvas>` element and appends it to the DOM — that canvas is the surface onto which WebGL draws.

---

## 3. The Game Loop and requestAnimationFrame

### Why not `setInterval`?

A beginner might think: "I want to update my game 60 times per second, so I'll use `setInterval(update, 16.67)`." This is wrong for several important reasons:

1. **`setInterval` is not synchronized to the display's refresh rate.** If the monitor refreshes at 60Hz and your timer fires at a slightly different rate, you get screen tearing — the screen shows part of one frame and part of another.
2. **`setInterval` keeps firing even when the tab is hidden**, wasting CPU and battery.
3. **`setInterval` has no concept of how much time actually elapsed** between calls, so fast machines and slow machines run the game at different speeds.

### `requestAnimationFrame`: the right tool

`requestAnimationFrame(callback)` tells the browser: "Before you paint the next frame, call this function." The browser:

- Calls it **in sync with the display refresh** (usually 60Hz, but could be 120Hz or 144Hz on high-refresh monitors)
- **Pauses it automatically** when the tab is backgrounded
- **Passes a timestamp** to the callback so you can measure elapsed time

Here is the canonical game loop pattern:

```javascript
function animate() {
    requestAnimationFrame(animate);   // Schedule the NEXT frame
    update();                         // Update game state
    renderer.render(scene, camera);   // Draw the current frame
}
animate(); // Start the loop
```

Notice: `animate` schedules itself. The first call to `animate()` runs, schedules the next call, updates, renders, and exits. The browser then calls it again before the next paint. This creates a self-perpetuating loop that the browser controls, not you.

### The timing of one frame

```
Frame N:
  ┌─ requestAnimationFrame callback fires
  │   ├─ update() — move player, check input, animate objects
  │   └─ renderer.render() — tell GPU to draw the scene
  └─ browser composites and displays the frame on screen

Frame N+1:
  ┌─ requestAnimationFrame callback fires
  ...
```

Each frame is a complete snapshot. If it takes 5ms to compute, no problem — you have 16ms budget. If something takes 30ms, you've dropped a frame.

---

## 4. JavaScript Concepts You Need

Coming from C or Python, some JavaScript patterns will look strange. Let's demystify the most important ones.

### Arrow functions and callbacks

In C, you can pass a function pointer. In JavaScript, functions are first-class values — you can store them in variables and pass them around.

```javascript
// Traditional function declaration
function greet(name) {
    return "Hello, " + name;
}

// Arrow function — shorter syntax for the same thing
const greet = (name) => "Hello, " + name;

// Passing a function as a callback
document.addEventListener('click', () => {
    console.log("clicked!");
});
```

That last example passes an **anonymous arrow function** directly as the callback. The browser stores it and calls it whenever a click happens.

### Closures: variables that survive their scope

This is one of JavaScript's most powerful and confusing features. A closure is a function that **captures variables from its surrounding scope** and keeps them alive even after that scope has finished executing.

```javascript
function makeCounter() {
    let count = 0;                    // This lives on the heap, not the stack
    return () => {
        count++;
        return count;
    };
}

const counter = makeCounter();
counter(); // returns 1
counter(); // returns 2
counter(); // returns 3
```

`makeCounter()` returns a function. That function keeps a reference to `count` even though `makeCounter()` has finished. `count` is not destroyed when `makeCounter` returns — it lives as long as the returned function lives.

In our game, the `keys` object is captured by closures:

```javascript
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true;  });
document.addEventListener('keyup',   e => { keys[e.code] = false; });
```

Both callbacks close over `keys`. Even though they are registered and then the surrounding code continues, they keep a live reference to `keys` and can mutate it whenever called.

### Destructuring

```javascript
// Without destructuring
const point = [4, -6];
const x = point[0];
const z = point[1];

// With destructuring — same thing, shorter
const [x, z] = [4, -6];

// In a forEach loop
[[4,-6], [-7,-13]].forEach(([x, z]) => {
    // x and z are already unpacked from each pair
});
```

### `const` vs `let` vs `var`

- `const` — the binding cannot be reassigned (the variable always points to the same object), but the object itself can be mutated. Use this by default.
- `let` — can be reassigned. Use when you need to change what the variable points to.
- `var` — old, function-scoped, avoid it. Pretend it doesn't exist.

---

## 5. The GPU and WebGL

### The CPU and GPU: two different computers

Your computer has two processors:

- **CPU** (Central Processing Unit) — a few powerful cores optimized for sequential logic. This is where JavaScript runs.
- **GPU** (Graphics Processing Unit) — thousands of weak cores optimized for doing the same simple operation on thousands of data points simultaneously. This is where pixels get calculated.

Drawing a 3D scene requires calculating the color of millions of pixels, and doing that 60 times per second. No CPU can do this fast enough. So we use the GPU.

### What WebGL is

**WebGL** (Web Graphics Library) is a JavaScript API that gives you direct access to the GPU from the browser. It is based on OpenGL ES, a subset of the professional OpenGL graphics API.

WebGL works by sending **commands and data** from the CPU (JavaScript) to the GPU (graphics card). The fundamental operations are:

1. Upload vertex data (the 3D positions of your geometry) into GPU memory (buffers)
2. Upload texture data (images) into GPU memory
3. Write **shader programs** — small programs that run on the GPU
4. Issue draw calls — "draw these N triangles using this shader"

### Shaders

Shaders are programs that run on the GPU, written in **GLSL** (OpenGL Shading Language), a C-like language. There are two kinds:

**Vertex Shader** — runs once per vertex (corner point of a triangle). Its job: transform the 3D position of each vertex into 2D screen coordinates.

```glsl
// A minimal vertex shader
attribute vec3 position;   // Input: 3D position of this vertex
uniform mat4 modelViewProjectionMatrix; // Input: transform matrix

void main() {
    // Output: where this vertex appears on screen
    gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}
```

**Fragment Shader** (also called Pixel Shader) — runs once per pixel that a triangle covers on screen. Its job: output the color of that pixel.

```glsl
// A minimal fragment shader
void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Output: red pixel (RGBA)
}
```

For a 1920×1080 screen, the fragment shader might run **2 million times per frame**. This is why we need thousands of GPU cores running in parallel.

### Why you don't write raw WebGL

Raw WebGL is powerful but extremely verbose. Drawing a single triangle requires about 80 lines of JavaScript: create buffers, bind buffers, upload data, compile shaders, link programs, set uniforms, bind vertex attributes, issue a draw call. Three.js handles all of this for you, exposing a much cleaner API. But understanding that this machinery exists underneath is what lets you debug problems and understand performance.

---

## 6. Three.js: The 3D Engine

Three.js is a JavaScript library that wraps WebGL in a high-level, object-oriented API. Its job is to let you think in terms of "scene", "camera", "mesh", "light" rather than "buffer", "shader", "draw call".

Three.js manages:
- The WebGL context and state machine
- Shader compilation and caching
- Buffer uploads to the GPU
- The render loop (you call `renderer.render(scene, camera)` and it handles the rest)
- Matrix math (transforms, projections)

When we write:

```javascript
import * as THREE from 'three';
// OR load from CDN:
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

…we get the `THREE` namespace, containing every class we need.

The core objects every Three.js application needs:

| Object | Role |
|---|---|
| `THREE.Scene` | The container that holds all 3D objects |
| `THREE.Camera` | The viewpoint — defines what we see |
| `THREE.WebGLRenderer` | Draws the scene using WebGL |
| `THREE.Mesh` | A 3D object (geometry + material) |
| `THREE.Light` | A light source in the scene |

---

## 7. 3D Coordinate Systems

### From 2D to 3D

In 2D, you have two axes:
- **X** — horizontal (right is positive)
- **Y** — vertical (up is positive in math; in DOM/CSS, down is positive)

In 3D, we add:
- **Z** — depth (the axis pointing toward or away from you)

### Three.js uses a right-handed coordinate system

Hold your right hand out flat. Point your fingers along the positive X axis (to the right). Curl them toward the positive Y axis (upward). Your thumb now points in the positive Z direction — **toward you**, out of the screen.

```
        Y (up)
        │
        │
        │_________ X (right)
       /
      /
     Z (toward you)
```

This is the **right-handed coordinate system** (used by Three.js, OpenGL, most math textbooks). DirectX and some game engines use a left-handed system where Z points away from you — a common source of confusion when reading documentation from different ecosystems.

### What this means in practice

In our game, when the player stands at the origin and looks forward (into the scene):
- Moving right increases X
- Moving up increases Y
- Moving **backward** (toward the camera) increases Z; moving **forward** (into the scene) **decreases** Z

This is why in our movement code, "forward" is `-Z`:

```javascript
direction.z = forward - backward;  // forward key gives -Z movement
camera.translateZ(moveDir.z * speed * delta); // negative Z = forward
```

### World coordinates vs local coordinates

Every object has a **local coordinate system** centered on itself, and the **world coordinate system** which is the shared space where everything lives.

When you place a box at `position.set(5, 0, -10)`, that's its world position. But if you then ask the box to "move forward 1 unit" in its local space, it moves along its own local Z axis — which may be different from the world Z axis if the box has been rotated.

`camera.translateZ(-1)` moves the camera **1 unit forward along the camera's own local Z axis**, regardless of which direction the camera is facing in the world. This is how first-person movement works — you translate in local camera space, and the camera's local axes rotate with it as you look around.

---

## 8. Vectors and Vector Mathematics

### What a vector is

A **vector** represents a direction and a magnitude (length). In 3D, a vector has three components: `(x, y, z)`.

Contrast this with a **point**, which represents a position in space. Mathematically they look the same — both are `(x, y, z)` — but conceptually they're different: a point is a location, a vector is a displacement.

In Three.js, both are represented by `THREE.Vector3`.

```javascript
const position = new THREE.Vector3(5, 1.7, -10);  // point: a location
const velocity = new THREE.Vector3(0, 0, -1);      // vector: "move forward"
```

### Vector addition: moving a point

To move a point by a velocity:

```
newPosition = position + velocity * deltaTime
```

In component form: `(5+0, 1.7+0, -10 + (-1)*dt)` = the point moves forward by `dt` units.

```javascript
position.addScaledVector(velocity, deltaTime);
// equivalent to: position.x += velocity.x * dt
//                position.y += velocity.y * dt
//                position.z += velocity.z * dt
```

### Vector length (magnitude)

The length of a vector `(x, y, z)` is:

```
|v| = √(x² + y² + z²)
```

This is just the 3D Pythagorean theorem — the diagonal of a box with sides x, y, z.

### Normalization: making a vector unit length

A **unit vector** (or normalized vector) has length exactly 1. It describes a pure direction with no magnitude information.

```javascript
const direction = new THREE.Vector3(1, 0, -1); // diagonal movement
direction.normalize(); // now length = 1
// was: √(1² + 0² + 1²) = √2 ≈ 1.414
// normalized: (1/√2, 0, -1/√2) ≈ (0.707, 0, -0.707)
```

Why does this matter? In our movement code:

```javascript
moveDir.set(rght - left, 0, back - fwd);
moveDir.normalize();
```

If the player presses W and D simultaneously, `moveDir` is `(1, 0, -1)` — a diagonal. Without normalizing, the player would move **√2 ≈ 1.414× faster diagonally** than straight ahead (because the vector is longer). Normalizing ensures diagonal movement is the same speed as cardinal movement.

### The dot product

The **dot product** of two vectors `a` and `b` is:

```
a · b = ax*bx + ay*by + az*bz = |a| * |b| * cos(θ)
```

Where `θ` is the angle between them. This is extraordinarily useful:

- If `a · b > 0`, the vectors point in roughly the same direction (angle < 90°)
- If `a · b = 0`, they are perpendicular
- If `a · b < 0`, they point in roughly opposite directions
- If both are unit vectors, `a · b = cos(θ)` — the dot product directly gives the cosine of the angle

Uses in games: checking if an enemy is in front of you, calculating how much light hits a surface, back-face culling.

### The cross product

The **cross product** `a × b` produces a new vector perpendicular to both `a` and `b`:

```
(a × b).x = ay*bz - az*by
(a × b).y = az*bx - ax*bz
(a × b).z = ax*by - ay*bx
```

Uses in games: computing surface normals (which direction a face points), finding the vector perpendicular to a movement direction for strafing.

---

## 9. The Scene Graph

### What it is

A **scene graph** is a hierarchical tree data structure where each node represents an object in the scene. In Three.js, `THREE.Scene` is the root, and every object added to it (or to another object) becomes a child node.

```
Scene (root)
├── AmbientLight
├── DirectionalLight
├── Ground (Mesh)
├── Building_A (Mesh)
│   └── Window_1 (Mesh)   ← child of Building_A
│   └── Window_2 (Mesh)
├── Tree_1 (Group)
│   ├── Trunk (Mesh)
│   └── Canopy (Mesh)
└── Camera
```

### Why hierarchy matters

When a parent node is transformed (moved, rotated, scaled), **all of its children inherit that transformation**. If you move `Tree_1` in the example above, both `Trunk` and `Canopy` move with it — because they are defined in `Tree_1`'s local coordinate system.

This is how animated characters work: a skeleton is a scene graph. Move the upper arm bone, and the lower arm, hand, and fingers all follow — because they are children in the hierarchy.

In our game, we kept things simple and added everything directly to the scene root. But in a more complex game, you'd have nested hierarchies everywhere.

### Three.js implementation

```javascript
const scene = new THREE.Scene();

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);           // mesh is now a child of scene
mesh.add(anotherMesh);     // anotherMesh is a child of mesh
```

Each `Object3D` (the base class for everything in Three.js) has:
- `position` — a `Vector3` for local position
- `rotation` — an `Euler` for local rotation
- `scale` — a `Vector3` for local scale
- `children` — array of child objects
- `parent` — reference to parent (or null for scene root)

---

## 10. Geometry: Describing Shape with Triangles

### Why triangles?

Every 3D shape on screen, no matter how complex, is ultimately made of **triangles**. Triangles are the universal primitive of real-time graphics because:

1. Three points always define exactly one plane (three non-collinear points determine a unique plane)
2. They can be rasterized (converted to pixels) efficiently in hardware
3. Any polygon can be decomposed into triangles

A cube has 6 faces. Each face is a square, which is split into 2 triangles. So a cube is **12 triangles** or **36 vertices** (3 per triangle × 12 triangles, though shared vertices can be indexed to save memory).

### Vertices

A **vertex** is a point in 3D space that forms a corner of a triangle. Beyond position, a vertex can carry extra data:

- **UV coordinates** — 2D coordinates that map a texture onto the surface (named U and V because X and Y are already taken by 3D space)
- **Normal vector** — the direction the surface faces at that vertex (used for lighting)
- **Color** — per-vertex color

### Three.js geometries

Three.js provides pre-built geometry classes that generate the correct vertex data:

**BoxGeometry** — a rectangular cuboid

```javascript
new THREE.BoxGeometry(width, height, depth)
new THREE.BoxGeometry(2, 4, 2)  // 2 wide, 4 tall, 2 deep
```

Internally, this generates 24 vertices (4 per face × 6 faces, with unique normals per face) and 12 triangles.

**PlaneGeometry** — a flat rectangle

```javascript
new THREE.PlaneGeometry(width, height, widthSegments, heightSegments)
new THREE.PlaneGeometry(200, 200)  // 200×200 unit flat surface
```

By default, a plane is created in the XY plane (facing the Z axis). To make it flat on the ground, we rotate it:

```javascript
ground.rotation.x = -Math.PI / 2;  // -90 degrees around X axis
```

`Math.PI` is π ≈ 3.14159. `Math.PI / 2` is π/2 = 90°. Rotations are always in **radians**, not degrees. Radians are the natural unit of angle: one radian is the angle subtended by an arc equal in length to the radius. A full circle is 2π radians = 360°.

**SphereGeometry** — an approximation of a sphere using triangular faces

```javascript
new THREE.SphereGeometry(radius, widthSegments, heightSegments)
new THREE.SphereGeometry(0.5, 10, 7)  // radius 0.5, 10 columns, 7 rows of faces
```

More segments = smoother sphere = more triangles = higher GPU cost. A sphere with 32×32 segments has 2048 triangles. Choose wisely.

**CylinderGeometry** — used for tree trunks

```javascript
new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
new THREE.CylinderGeometry(0.2, 0.2, 1.8, 10)  // straight cylinder, 10-sided
```

If `radiusTop !== radiusBottom`, you get a cone or frustum.

### What `args` means

In the React Three Fiber examples you may have seen:

```jsx
<boxGeometry args={[2, 2, 2]} />
```

`args` is just the array of constructor arguments, spread into `new THREE.BoxGeometry(2, 2, 2)`. It's R3F syntax sugar.

---

## 11. Materials: Describing Surface Appearance

A **material** describes how a surface looks: its color, how it reacts to light, whether it's transparent, etc. Geometry tells you **where** the surface is. Material tells you **what it looks like**.

Every `THREE.Mesh` requires both:

```javascript
const mesh = new THREE.Mesh(geometry, material);
```

### MeshLambertMaterial

This is the material we used throughout the game. It implements **Lambertian reflectance** — a physically-based model for matte, diffuse surfaces.

Lambert's Law states that the brightness of a matte surface is proportional to the cosine of the angle between the surface normal and the light direction:

```
brightness = max(0, normal · lightDirection)
```

This is why surfaces facing the light are bright and surfaces facing away are dark. It produces realistic-looking matte surfaces (walls, ground, wood) without being computationally expensive.

```javascript
new THREE.MeshLambertMaterial({ color: 0x8B6355 })
```

The `color` property accepts:
- **Hex number**: `0xFF0000` (red, same format as HTML `#FF0000`)
- **CSS string**: `'royalblue'`, `'#ff0000'`
- **THREE.Color object**: `new THREE.Color(0.5, 0.2, 0.8)`

### MeshStandardMaterial (not used here, but important to know)

This implements **Physically Based Rendering (PBR)** — a more accurate model with `roughness` and `metalness` properties. It's more expensive to compute but produces dramatically more realistic results. Most modern game engines use PBR.

```javascript
new THREE.MeshStandardMaterial({
    color: 0x8B6355,
    roughness: 0.8,   // 0 = mirror, 1 = fully diffuse
    metalness: 0.1    // 0 = non-metal, 1 = metal
})
```

### MeshBasicMaterial

Ignores all lighting. The color is exactly as specified. Useful for debug visualization, UI elements, or emissive objects (things that glow). Our `GridHelper` uses this.

### Textures

We didn't use textures in this game, but they're the next step. A **texture** is an image (PNG, JPG) that gets mapped onto the surface of a mesh using the UV coordinates baked into the geometry.

```javascript
const loader = new THREE.TextureLoader();
const texture = loader.load('brick_wall.png');
const material = new THREE.MeshLambertMaterial({ map: texture });
```

The `map` property assigns the texture as the diffuse color map. UV coordinates determine how the image stretches/tiles across the surface.

---

## 12. Lighting and Shading Models

Lighting is what makes 3D look 3D. Without it, everything is flat and black (or a uniform color if you use MeshBasicMaterial).

### AmbientLight: filling the shadows

Real light bounces off surfaces and illuminates everything, including shadow regions. Accurately simulating this is called **global illumination** and is computationally very expensive.

**Ambient light** is the cheap approximation: add a constant base brightness to every surface, regardless of orientation or shadow. It prevents surfaces from going completely black.

```javascript
const ambient = new THREE.AmbientLight(0xffeedd, 0.45);
scene.add(ambient);
```

Arguments: `color, intensity`. Think of it as "the color of the sky filling in the shadows."

Too much ambient light makes the scene look flat (no depth perception). Too little makes shadows completely black (unrealistic). Balance it with your directional light.

### DirectionalLight: simulating the sun

A directional light casts parallel rays from a specified direction, as if the source is infinitely far away. This models the sun.

```javascript
const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
sun.position.set(60, 90, 40);
scene.add(sun);
```

**Important**: for a `DirectionalLight`, `position` is not where the light lives — it's the direction the light comes from. The light shines from `(60, 90, 40)` toward the origin `(0, 0, 0)`. The actual source is treated as infinitely far away.

The intensity multiplies with the Lambert factor. The color simulates warm sunlight (slightly yellow-orange).

### HemisphereLight: sky/ground gradient

A hemisphere light applies two colors — one for surfaces facing up (sky color) and one for surfaces facing down (ground bounce color) — blended by the surface normal.

```javascript
scene.add(new THREE.HemisphereLight(0x87CEEB, 0x4a7c45, 0.35));
// skyColor, groundColor, intensity
```

A surface pointing straight up gets the sky color. A surface pointing straight down gets the ground color. Surfaces on the sides get a blend. This adds a beautiful subtle tint to the ambient fill that makes the scene feel like it's sitting in a real environment.

### PointLight (not used here)

Emits light in all directions from a single point, like a light bulb. Has `distance` and `decay` properties to limit its reach.

```javascript
const pointLight = new THREE.PointLight(0xff8800, 1.5, 20); // color, intensity, distance
pointLight.position.set(0, 3, -5);
scene.add(pointLight);
```

### SpotLight (not used here)

Like a point light, but constrained to a cone. Used for flashlights, streetlamps, stage lights.

### How lighting is computed per frame

When you have Lambert shading with a directional light, for each fragment (pixel) on a surface, the GPU computes:

```
finalColor = ambientColor * ambientIntensity
           + surfaceColor * max(0, dot(normal, lightDir)) * lightColor * lightIntensity
```

This runs in the fragment shader, potentially millions of times per frame, on thousands of GPU cores simultaneously.

---

## 13. The Camera and Projection Mathematics

### The camera is just math

There is no physical camera object that exists in 3D space in some special way. A camera is a mathematical transformation: it takes the 3D positions of all vertices and projects them onto a 2D rectangle (the screen).

The camera defines two transformations:

1. **View matrix** — transforms world space into camera space (moves everything so the camera is at the origin, looking down -Z)
2. **Projection matrix** — transforms camera space into clip space (applies perspective)

### PerspectiveCamera

```javascript
const camera = new THREE.PerspectiveCamera(
    75,                              // FOV: field of view, in degrees
    window.innerWidth / window.innerHeight,  // aspect ratio
    0.1,                             // near clipping plane
    500                              // far clipping plane
);
camera.position.set(0, 1.7, 0);
```

**Field of View (FOV):** The vertical angle of the view frustum. 75° is a fairly wide angle, similar to human peripheral vision. A narrower FOV (45°) looks like a telephoto lens — zoomed in, less perspective distortion. A wider FOV (110°) creates a "fish-eye" effect.

```
         /─────────────────────────\
        /    visible world           \
       /         (frustum)            \
camera                                far plane
       \                             /
        \───────────────────────────/

        |←─────────── FOV ────────→|
```

**Aspect Ratio:** Width divided by height of the rendering surface. If you don't update this when the window resizes, the scene will look stretched.

```javascript
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); // must call this after changing camera properties
    renderer.setSize(window.innerWidth, window.innerHeight);
});
```

**Clipping Planes:** The near and far planes define the **view frustum** — the 3D pyramid shape of what the camera can see. Anything closer than `near` (0.1 units) or farther than `far` (500 units) is not rendered.

- `near` too close (like 0.0001): causes **z-fighting** — floating point precision isn't high enough to distinguish surfaces that are very close, causing flickering.
- `near` too far (like 10.0): objects close to you disappear abruptly.
- `far` too small: the horizon clips in too close (useful if you want fog to hide it).
- `far` too large: wastes depth buffer precision, causing z-fighting at distance.

### Perspective projection

The projection matrix applies **foreshortening** — objects farther away appear smaller. This is how real cameras and human eyes work. Mathematically, the X and Y position of a vertex on screen is divided by its Z depth:

```
screenX = worldX / worldZ * focalLength
screenY = worldY / worldZ * focalLength
```

This creates the perspective effect. An object at Z=2 looks twice as large as the same object at Z=4.

### OrthographicCamera (not used here)

An orthographic camera applies **no perspective** — parallel lines remain parallel, and objects don't shrink with distance. Used for 2D games, CAD applications, isometric games (like classic SimCity), and UI rendering.

---

## 14. Transformations: Position, Rotation, and Scale

Every object in Three.js has three transform properties:

```javascript
mesh.position.set(5, 2, -10);  // Move to world position (5, 2, -10)
mesh.rotation.y = Math.PI / 4; // Rotate 45° around Y axis
mesh.scale.set(2, 2, 2);       // Make it twice as big in all directions
```

### The transformation matrix

Under the hood, all three (position, rotation, scale) are combined into a single **4×4 matrix** called the **model matrix** (or world matrix). This matrix transforms every vertex from the object's local space into world space.

Why 4×4 and not 3×3? Because translation (moving) cannot be expressed as a 3×3 linear transformation — it requires an extra dimension. This technique is called **homogeneous coordinates**, and it allows position, rotation, and scale to all be combined into a single matrix multiplication.

```
[ r11 r12 r13 tx ]   [ x ]   [ x' ]
[ r21 r22 r23 ty ] × [ y ] = [ y' ]
[ r31 r32 r33 tz ]   [ z ]   [ z' ]
[   0   0   0  1 ]   [ 1 ]   [  1 ]
```

Where `r` terms encode rotation and scale, and `tx, ty, tz` encode translation.

Three.js computes and uploads this matrix to the GPU for every object, every frame. You never need to construct it manually when using Three.js — `mesh.position`, `mesh.rotation`, and `mesh.scale` are the friendly interface.

### Order of transformations matters

Matrix multiplication is **not commutative**: `A × B ≠ B × A`. This means the order you apply transformations changes the result.

"Rotate then translate" moves the object along the world axes:
```
(object at origin) → rotate 90° → translate (5, 0, 0)
Result: object is at (5, 0, 0), rotated
```

"Translate then rotate" rotates around the world origin:
```
(object at origin) → translate (5, 0, 0) → rotate 90°
Result: object has orbited the origin and is now at (0, 0, -5), rotated
```

Three.js applies transformations in the order: **Scale → Rotate → Translate** (in local space). This is the most common and intuitive order.

---

## 15. Euler Angles and Quaternions

Rotation is the most mathematically complex part of 3D graphics. Let's understand it properly.

### Euler Angles

An **Euler angle** representation uses three angles — one for each axis — to describe an orientation:

```javascript
const euler = new THREE.Euler(
    Math.PI / 4,   // rotation around X axis (pitch — looking up/down)
    Math.PI / 2,   // rotation around Y axis (yaw — looking left/right)
    0,             // rotation around Z axis (roll — tilting head)
    'YXZ'          // order in which rotations are applied
);
```

Euler angles are intuitive ("rotate 45° up, then 30° to the right") but have a critical problem called **Gimbal Lock**.

### Gimbal Lock

Gimbal lock occurs when two rotation axes become aligned, causing you to lose one degree of freedom. The classic example: if you rotate 90° around the X axis (pitch straight up), then Y rotation and Z rotation now affect the same axis — you can no longer roll.

For a first-person camera, if the pitch (X rotation) reaches exactly ±90°, you hit gimbal lock. This is why we clamp it:

```javascript
euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));
// Keep pitch just under ±90°, never reaching the gimbal lock singularity
```

### The rotation order matters

`'YXZ'` means: apply Y rotation first, then X, then Z. For a first-person camera, this is critical:

- **Y first (yaw)**: turn left/right in the horizontal plane
- **X second (pitch)**: tilt up/down relative to the current yaw direction
- **Z last**: (we don't use roll for a walking camera)

If you used `'XYZ'` order for a first-person camera, moving your mouse horizontally would cause the horizon to tilt — deeply wrong behavior.

### Quaternions

A **quaternion** is an alternative to Euler angles for representing rotation. It has 4 components `(x, y, z, w)` and is harder to understand intuitively, but:

1. **No gimbal lock** — quaternions represent rotation as a single rotation around an arbitrary axis, not three sequential rotations
2. **Smooth interpolation** — you can interpolate between two quaternions spherically (SLERP) without weird artifacts
3. **Efficient composition** — combining two rotations is a quaternion multiplication

In Three.js, `camera.quaternion` stores the camera's current orientation. We use Euler angles as the user-facing interface (mouse delta → Euler angle delta → update quaternion):

```javascript
euler.setFromQuaternion(camera.quaternion); // Read current rotation as Euler
euler.y -= mouseDeltaX * sensitivity;       // Modify it
euler.x -= mouseDeltaY * sensitivity;
euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x)); // Clamp pitch
camera.quaternion.setFromEuler(euler);      // Write back as quaternion
```

We work in Euler for human-readable manipulation, but store in quaternion for correctness.

---

## 16. The Renderer: Bringing It All Together

```javascript
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
```

### WebGLRenderer

This creates and manages the WebGL context. `renderer.domElement` is the `<canvas>` element it creates internally. We append it to the document body so it appears on screen.

### `antialias: true`

Without antialiasing, the edges of triangles appear as jagged "staircase" patterns (aliasing). Antialiasing smooths these edges by sampling multiple sub-pixel positions and averaging them. The cost: a few percent more GPU work, well worth it for visual quality.

The browser uses **MSAA** (Multisample Anti-Aliasing) when you enable this, which samples the geometry edges at multiple points per pixel.

### `setPixelRatio`

High-DPI ("Retina") displays have a `devicePixelRatio` of 2 or higher — meaning each "CSS pixel" is actually 4 physical pixels (2×2). If we don't account for this, the canvas renders at CSS resolution and the browser scales it up, making it blurry.

```javascript
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

We cap at 2 because higher ratios (3, 4 on some phones) would render 9–16× more pixels, which is prohibitively expensive for little visible benefit on a monitor-sized screen.

### Shadow maps

`renderer.shadowMap.enabled = true` enables shadow rendering globally. Then individual lights and meshes opt in:

```javascript
sun.castShadow = true;     // This light casts shadows
mesh.castShadow = true;    // This mesh blocks light (casts a shadow)
mesh.receiveShadow = true; // This mesh shows shadows cast on it
```

`THREE.PCFSoftShadowMap` — PCF stands for **Percentage Closer Filtering**. Standard shadow maps have hard, aliased edges. PCF samples the shadow map at multiple points around each fragment and averages the results, producing soft shadow edges. This is explained further in the shadow mapping section.

### `renderer.render(scene, camera)`

This is the command that triggers one frame of rendering:

1. Three.js walks the scene graph, collecting all visible meshes
2. For each light with `castShadow = true`, it renders a **shadow map** (depth map from the light's perspective)
3. It sets the camera's view and projection matrices as GPU uniforms
4. For each mesh, it uploads the model matrix, binds the material's shader and textures, and issues a draw call
5. The GPU executes the vertex shaders and fragment shaders
6. The result appears in the canvas

---

## 17. Fog: Atmospheric Depth

```javascript
scene.fog = new THREE.FogExp2(0x87CEEB, 0.018);
```

**Fog** blends distant objects toward a fog color, simulating atmospheric scattering. This makes the scene look deeper and hides the abrupt geometry cutoff at the far clipping plane.

### Linear fog vs exponential fog

**Linear fog** (`THREE.Fog`): objects are fully visible below `near` distance, fully fogged at `far` distance, linearly interpolated in between. Predictable and easy to tune.

**Exponential fog** (`THREE.FogExp2`): the fog density is applied as `e^(-density * distance)`. It increases smoothly with distance, which looks more physically natural. The `density` parameter (0.018 in our case) controls how thick the fog is. Higher = thicker.

```
visibility = e^(-0.018 * distance)
At distance 20:  e^(-0.36)  ≈ 0.70 — 70% visible
At distance 50:  e^(-0.90)  ≈ 0.41 — 41% visible
At distance 100: e^(-1.80)  ≈ 0.17 — 17% visible
```

The fog color should match the sky color. In our game: `0x87CEEB` (sky blue). This makes distant objects fade into the horizon naturally rather than disappearing into a void.

### How fog is computed in the shader

The fragment shader receives the fragment's depth (distance from the camera) and blends:

```glsl
float fogFactor = exp(-fogDensity * fogDensity * depth * depth);
fogFactor = clamp(fogFactor, 0.0, 1.0);
gl_FragColor = mix(fogColor, surfaceColor, fogFactor);
// mix(a, b, t) = a*(1-t) + b*t
// when fogFactor = 1 (near): full surface color
// when fogFactor = 0 (far):  full fog color
```

Three.js injects this into the material's fragment shader automatically.

---

## 18. Shadow Mapping

Shadow mapping is one of the most important and widely used techniques in real-time 3D graphics. Let's understand it from first principles.

### The core problem

How do you know if a fragment (pixel on a surface) is in shadow? A fragment is in shadow if something else is between it and the light source. How do you test this efficiently for millions of fragments at 60fps?

### The shadow map algorithm

Shadow mapping solves this in two passes:

**Pass 1 — render from the light's perspective:**

Imagine a camera placed at the light source (or for a directional light, a camera looking in the light's direction). Render the scene from this viewpoint, but only record the **depth** of each pixel (how far the nearest surface is from the light). This creates the **shadow map** — a depth texture.

```
Light's view:
┌──────────────┐
│    0.5  0.6  │  ← depth values (normalized 0-1)
│    0.3  0.8  │    "nearest surface is X units from light"
│    0.9  0.4  │
└──────────────┘
```

**Pass 2 — render from the camera's perspective (normal rendering):**

For each fragment, project its world position back into the light's coordinate system. Look up the shadow map at that projected position to get the depth of the nearest surface the light could see. Compare:

- If `fragmentDepth ≤ shadowMapDepth + bias`: this fragment is **lit** (it's the nearest surface the light sees)
- If `fragmentDepth > shadowMapDepth + bias`: something closer blocked the light → **shadow**

```
Fragment at depth 0.7 from light.
Shadow map says nearest surface at 0.5 at this position.
0.7 > 0.5 → shadow! Something is in the way.
```

### Shadow map resolution and quality

```javascript
sun.shadow.mapSize.set(2048, 2048);
```

The shadow map is a texture. `2048×2048` means 4 million depth samples. Lower resolution = blocky, pixelated shadow edges. Higher resolution = sharper shadows, more VRAM usage, slower to render.

### The shadow camera frustum

For a directional light, Three.js uses an **orthographic camera** to render the shadow map. You must size its frustum to encompass your scene:

```javascript
sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
sun.shadow.camera.right = sun.shadow.camera.top  =  60;
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 250;
```

If your scene is larger than this box, objects outside it won't cast shadows. If it's much larger than necessary, shadow map resolution is wasted on empty space.

### PCF: soft shadow edges

Raw shadow maps produce hard, aliased shadow edges. **PCF (Percentage Closer Filtering)** samples the shadow map at multiple nearby points and averages the results:

```
Instead of one depth test:
"Is this fragment in shadow?" → yes/no

PCF does 9-16 depth tests in a radius:
"Of these 16 samples, 10 say shadow" → 62.5% in shadow → blend 62.5% shadow color
```

This produces soft, blurred shadow edges that look physically plausible. `PCFSoftShadowMap` in Three.js uses a Gaussian-weighted kernel for extra smoothness.

### The shadow acne problem and the depth bias

Without a bias adjustment, you'll see **shadow acne** — a pattern of dark spots and stripes on lit surfaces. This happens because the fragment's depth in the shadow map is numerically so close to the nearest surface depth that floating-point imprecision causes some fragments to falsely test as "in shadow" of themselves.

The fix: add a small bias offset, shifting the depth comparison so self-shadowing is avoided. Three.js does this automatically, but you can tune it:

```javascript
sun.shadow.bias = -0.001; // small negative bias typically helps
```

---

## 19. The Pointer Lock API: Capturing the Mouse

### The problem with normal mouse events

Normally, a mouse cursor has a position on screen (0, 0) to (screenWidth, screenHeight). When it reaches the screen edge, it stops. This is useless for a first-person camera — you need to be able to spin around continuously, which requires the mouse to move infinitely without hitting a boundary.

### Pointer Lock

The **Pointer Lock API** is a browser API specifically designed for this. When activated:

1. The mouse cursor is **hidden**
2. The cursor is **locked** to the center of the page (it doesn't move)
3. Mouse movement events report **delta values** — how much the mouse moved since last event — instead of absolute screen positions

```javascript
// Request pointer lock when the user clicks
renderer.domElement.requestPointerLock();

// Browser fires this event when lock is acquired or released
document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === renderer.domElement;
});

// Mouse movement events now give us deltas
document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    const deltaX = e.movementX;  // pixels moved since last event (can be negative)
    const deltaY = e.movementY;
    // Use these to rotate the camera
});
```

### Browser security requirements

Browsers require pointer lock to be requested **in response to a user gesture** (a click event). You cannot call `requestPointerLock()` automatically on page load. This is a security measure — websites shouldn't be able to trap your cursor without permission.

The browser will also show a notification to the user and allow them to press `ESC` to release the lock.

### Converting mouse delta to camera rotation

```javascript
const sensitivity = 0.0022;  // radians per pixel of mouse movement
euler.y -= e.movementX * sensitivity;  // horizontal mouse → yaw (left/right turn)
euler.x -= e.movementY * sensitivity;  // vertical mouse → pitch (up/down tilt)
```

Why **subtract** `movementX` for yaw? Moving the mouse right (positive `movementX`) should rotate the camera right. In a Y-up, right-hand coordinate system, rotating right means rotating around the Y axis in the **negative direction** (by the right-hand rule). So we subtract.

Similarly, moving the mouse down (positive `movementY`) should look down, which is rotating around X in the negative direction — hence we also subtract `movementY` for pitch.

The sensitivity multiplier converts pixel movement to radians. Too high and the camera spins wildly; too low and it feels sluggish. ~0.002 is typical for most games.

---

## 20. Event-Driven Input: Keyboard State Tracking

### The wrong way: polling inside keydown

A beginner might write:

```javascript
document.addEventListener('keydown', (e) => {
    if (e.key === 'w') {
        camera.position.z -= 0.1;  // move forward
    }
});
```

This has two critical problems:

1. **Repeat delay**: keyboard events fire once immediately on press, then after a ~500ms delay, then repeatedly at ~30Hz. You get a jerky "type" rate instead of smooth movement.
2. **Only one key at a time**: each keydown event is for one key. You can't detect "W and D both held" this way.

### The right way: state tracking

We separate **detecting state changes** (keydown/keyup events) from **reading state** (inside the game loop):

```javascript
// Record state changes as they happen
const keys = {};  // Acts as a hash map: keyCode → boolean
document.addEventListener('keydown', e => { keys[e.code] = true;  });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

// Read state every frame, inside the game loop
function update(delta) {
    const movingForward  = keys['KeyW'] || keys['ArrowUp'];
    const movingBackward = keys['KeyS'] || keys['ArrowDown'];
    const movingLeft     = keys['KeyA'] || keys['ArrowLeft'];
    const movingRight    = keys['KeyD'] || keys['ArrowRight'];
    const sprinting      = keys['ShiftLeft'] || keys['ShiftRight'];
    // ...
}
```

`e.code` is the physical key identifier (e.g., `'KeyW'`, `'ArrowUp'`, `'ShiftLeft'`). This is preferred over `e.key` (which gives the character, `'w'`/`'W'` depending on Caps Lock) because game controls should be position-based, not character-based. On a WASD layout, we want the physical W key regardless of whether Shift is held.

### Why this works smoothly

The `keys` object always reflects the **current state** of the keyboard (which keys are physically held down right now). The game loop reads it every frame (~60 times per second) and moves the player accordingly. There's no dependence on the OS key repeat rate — if `keys['KeyW']` is `true`, the player moves forward every single frame, smoothly.

---

## 21. Delta Time: Frame-Rate Independent Movement

This is one of the most important concepts in game development. Get this wrong and your game runs at different speeds on different machines.

### The problem

Suppose your movement code is:

```javascript
function animate() {
    requestAnimationFrame(animate);
    camera.position.z -= 0.1;  // move forward 0.1 units every frame
    renderer.render(scene, camera);
}
```

On a 60Hz monitor: moves 6 units per second (0.1 × 60)
On a 144Hz monitor: moves 14.4 units per second (0.1 × 144)
On a slow machine running at 30fps: moves 3 units per second (0.1 × 30)

The game runs at wildly different speeds on different hardware. Unacceptable.

### The solution: delta time

**Delta time** (Δt) is the elapsed time since the last frame, in seconds. Instead of moving a fixed amount per frame, we move an amount **proportional to how much time has passed**:

```javascript
// Speed in units per second
const WALK_SPEED = 7.0;

// In the game loop:
const delta = clock.getDelta(); // seconds since last call
camera.position.z -= WALK_SPEED * delta;
```

On 60fps: delta ≈ 0.0167s → moves 7.0 × 0.0167 = 0.117 units per frame = 7 units/sec
On 144fps: delta ≈ 0.0069s → moves 7.0 × 0.0069 = 0.048 units per frame = 7 units/sec
On 30fps: delta ≈ 0.0333s → moves 7.0 × 0.0333 = 0.233 units per frame = 7 units/sec

Now the **rate** (units per second) is the same on all hardware. The number of steps per second changes, but the total distance per second is constant. This is physics-correct movement.

### THREE.Clock

`THREE.Clock` is a utility that tracks elapsed time:

```javascript
const clock = new THREE.Clock(); // starts automatically

// In each frame:
const delta = clock.getDelta(); // returns seconds since last call to getDelta()
```

The first call returns time since the clock was created. Subsequent calls return time since the previous call. Internally it uses `performance.now()`, which has sub-millisecond precision.

### Capping delta time

If the game is minimized and then brought back, `getDelta()` might return 2 seconds — the player would teleport 14 units forward in one frame. Best practice: cap delta:

```javascript
const delta = Math.min(clock.getDelta(), 0.05); // cap at 50ms (20fps minimum)
```

---

## 22. Camera Space vs World Space

Understanding the difference between coordinate spaces is crucial for movement to feel right.

### World space

The absolute coordinate system of the scene. An object at `position (5, 0, -10)` is 5 units right, 0 up, and 10 units in front of the origin. Every object's world position is fixed regardless of where the camera is or what direction it faces.

### Camera space (view space)

The coordinate system relative to the camera. In camera space:
- The camera is always at the origin `(0, 0, 0)`
- The camera always looks in the **-Z direction**
- The camera's "up" is always +Y
- "Right" is always +X

The **view matrix** transforms world-space positions into camera space.

### Local space

The coordinate system of an individual object, defined relative to its own position and orientation.

### How first-person movement uses local space

This is the elegant part. Instead of computing movement in world space and accounting for the camera's yaw angle ourselves, we use `camera.translateZ()` and `camera.translateX()`:

```javascript
camera.translateX(moveDir.x * speed * delta); // right in camera's local space
camera.translateZ(moveDir.z * speed * delta); // forward in camera's local space
```

`translateZ(-1)` always moves the camera **forward along the camera's own local -Z axis**, regardless of which direction the camera faces. When the camera yaws left 45°, its local -Z axis points left-forward in world space. `translateZ(-1)` will move it left-forward in world space. This is exactly the behavior we want — the player moves in whatever direction they're looking.

Three.js internally computes: `worldMovement = camera.quaternion * localMovement`.

---

## 23. Head Bobbing: Sinusoidal Animation

Head bobbing is the subtle vertical oscillation of the camera when the player walks. It makes the game feel embodied and real. The math is simple: the sine function.

### The sine wave

The **sine function** `sin(t)` produces a smoothly oscillating value between -1 and +1 as `t` increases:

```
t:    0    π/2   π    3π/2   2π
sin: 0     1     0    -1     0    (one complete cycle)
```

It's the mathematical foundation of anything that oscillates: sound waves, spring physics, ocean waves, pendulums, and — in our case — head movement.

### Applying it to camera Y position

```javascript
// bobTime accumulates over time proportional to movement speed
bobTime += delta * frequency; // frequency controls how fast the bob cycles

// Camera height oscillates around EYE_HEIGHT
camera.position.y = EYE_HEIGHT + Math.sin(bobTime) * amplitude;
// Math.sin(bobTime) is between -1 and +1
// amplitude scales that to a small vertical range (e.g., 0.045 units)
```

Parameters:
- **Frequency**: how fast the bob cycle completes. We use 7 for walking, 12 for sprinting. Higher = faster steps.
- **Amplitude**: how far up and down the camera moves. 0.045 units is subtle — just enough to feel natural without being nauseating.

### Smooth return to rest

When the player stops, we don't want the camera to freeze mid-bob. We smoothly lerp it back to eye height:

```javascript
camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.15;
```

This is **exponential smoothing** (also called lerping — linear interpolation). Each frame, we move 15% of the remaining distance to the target height. This produces a smooth deceleration: fast at first, slower as we approach the target. It never quite reaches exactly `EYE_HEIGHT`, but gets close enough to be imperceptible within a few frames.

Mathematically: `position(t) = target - (target - start) * (1 - 0.15)^(t/dt)` — an exponential decay curve.

---

## 24. Performance and the Rendering Pipeline

Understanding why performance matters and how to reason about it.

### The rendering pipeline in brief

The GPU processes your scene through a fixed pipeline:

```
Vertex data (CPU) → Vertex Shader → Rasterization → Fragment Shader → Frame Buffer
```

1. **Vertex Shader**: runs per vertex. Transforms 3D positions to 2D screen coordinates.
2. **Rasterization**: the GPU determines which screen pixels are covered by each triangle. Hardware-accelerated, very fast.
3. **Fragment Shader**: runs per covered pixel. Calculates the final color using material properties, lighting, shadows, fog.
4. **Frame Buffer**: the output image is stored here, then displayed.

### Draw calls

A **draw call** is one command from the CPU to the GPU: "draw this set of triangles with this material." Each draw call has overhead regardless of how complex the geometry is — the CPU must communicate with the GPU driver, set state, etc.

A scene with 1000 objects might have 1000+ draw calls per frame. On modern hardware this is usually fine, but thousands of draw calls can become a bottleneck. Solutions:

- **Instancing**: draw the same mesh 1000 times in a single draw call with different transforms (`THREE.InstancedMesh`)
- **Merging**: combine multiple meshes into one (`THREE.BufferGeometryUtils.mergeBufferGeometries`)

### Triangle budget

Modern GPUs handle tens of millions of triangles per frame easily. But if you load a photogrammetry model with 10 million triangles and try to draw 100 of them, you have 1 billion triangles per frame — likely too many.

For games: use **Level of Detail (LOD)** — simpler geometry for distant objects, more detailed for close ones.

### Texture memory

Textures live in GPU VRAM. A 4096×4096 RGBA texture takes 64MB of VRAM uncompressed. Mobile GPUs have 2-4GB of VRAM. Load too many large textures and you'll stall as the GPU swaps between VRAM and system RAM.

Solutions: texture atlases (pack many small textures into one large one), mipmaps (pre-computed lower-resolution versions for distant objects), GPU texture compression (BC/DXT for desktop, ASTC for mobile).

### Shader complexity

The fragment shader runs for every pixel on screen, potentially millions of times per frame. An expensive fragment shader can tank performance even if you have few triangles. Keep fragment shaders as simple as possible. Move calculations to the vertex shader when possible (runs once per vertex, not per pixel).

---

## 25. What Comes Next

You've now understood every concept this game uses. Here is the natural learning path forward:

### Immediate improvements

**Collision detection**: currently the player walks through buildings. Add AABB (Axis-Aligned Bounding Box) collision:

```javascript
// For each building, check if the player's position overlaps its bounding box
// If so, push the player back
```

More advanced: use a physics library like **cannon-es** or **rapier-wasm** for rigid body simulation, gravity, and proper collision response.

**Jumping**: add a Y velocity component, apply gravity each frame, detect ground collision to stop falling:

```javascript
velocityY -= 9.8 * delta; // gravity
camera.position.y += velocityY * delta;
if (camera.position.y <= EYE_HEIGHT) {
    camera.position.y = EYE_HEIGHT;
    velocityY = 0;
}
```

**Loading 3D models**: instead of primitive geometry (boxes, spheres), load artist-created models in **GLTF** format (the "JPEG of 3D"):

```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
const loader = new GLTFLoader();
loader.load('building.glb', (gltf) => {
    scene.add(gltf.scene);
});
```

### Core math to study

- **Linear algebra**: vectors, matrices, dot product, cross product — the mathematical backbone of all 3D graphics
- **Trigonometry**: sin, cos, tan, atan2 — used everywhere in rotation and angle math
- **Calculus intuition**: derivatives (velocity from position, acceleration from velocity), integrals (physics simulation)

### React Three Fiber

Once comfortable with raw Three.js, migrate to **React Three Fiber** (R3F). Your existing React skills transfer directly. Objects become components:

```jsx
function Scene() {
    const meshRef = useRef();
    useFrame((state, delta) => {
        meshRef.current.rotation.y += delta; // rotate every frame
    });
    return (
        <mesh ref={meshRef} position={[0, 1, -5]}>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="royalblue" />
        </mesh>
    );
}

export default function App() {
    return (
        <Canvas>
            <ambientLight />
            <directionalLight position={[10, 10, 5]} castShadow />
            <Scene />
        </Canvas>
    );
}
```

### Shader programming

Write custom GLSL shaders for effects that pre-built materials can't achieve: water with wave displacement, heat distortion, cel shading (cartoon look), glowing edges, procedural terrain. This is where graphics programming becomes an art.

### The broader ecosystem

- **Rapier / cannon-es** — physics engines (rigid bodies, joints, raycasting)
- **@react-three/rapier** — Rapier integrated with R3F
- **Blender** — free 3D modeling software; export as `.glb` for Three.js
- **WebGPU** — the successor to WebGL, faster and more flexible; Three.js already supports it
- **WASM (WebAssembly)** — run C/C++/Rust code at near-native speed in the browser; useful for physics, pathfinding, heavy computation

---

## Summary of Key Mental Models

| Concept | Mental Model |
|---|---|
| Event loop | Your code is a contractor called by the building, not a resident living in it |
| requestAnimationFrame | "Call me before every paint" — you never own the clock |
| Scene graph | A tree of objects; children inherit parent transforms |
| Mesh = Geometry + Material | Shape + Surface appearance |
| Vertex shader | Runs per corner point; converts 3D → 2D screen position |
| Fragment shader | Runs per pixel; outputs a color |
| Delta time | Multiply all movement by elapsed seconds for hardware-independent speed |
| Euler angles | Intuitive but has gimbal lock singularities |
| Quaternions | No gimbal lock; used internally for correct rotation composition |
| Shadow map | Render depth from light's view; compare to determine shadow |
| Pointer lock | Hides cursor, gives infinite mouse delta for first-person look |
| Local space movement | `translateZ(-1)` always means "forward" regardless of camera yaw |
| Head bob | `sin(time)` — the sine function converts accumulated time into oscillation |

---

*This document was written alongside the `index.html` 3D explorer game. Every concept described here has a direct counterpart in that source code. The best way to internalize these ideas is to modify the game: change the fog density, add a new geometry type, alter the movement speed, tweak the shadow map size, and observe what changes.*
