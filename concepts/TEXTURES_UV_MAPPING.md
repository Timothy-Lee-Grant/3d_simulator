# Textures and UV Mapping

> How `TextureGenerator.js` synthesizes every surface texture from scratch using the Canvas 2D API, how UV coordinates map those textures onto geometry, how normal maps fake surface depth without adding polygons, and why we switched from `meshLambertMaterial` to `meshStandardMaterial`.

---

## What a Texture Actually Is

Strip away every abstraction and a texture is this: **a 2D array of pixel values stored in GPU memory**.

When the GPU renders a fragment (pixel) on a mesh surface, it looks up the colour at a specific (U, V) coordinate in the texture array and uses it as input to the lighting calculation. That lookup is called a **texture sample**.

In Three.js, `THREE.CanvasTexture` takes a browser `<canvas>` element, reads its pixel data via `getImageData`, and uploads it to GPU memory on first use. Once uploaded, sampling happens entirely on the GPU — the CPU never touches those pixels again during normal rendering.

```
CPU side                  GPU side
─────────────────         ─────────────────────────────────────
Canvas element            Texture object in VRAM
  └─ 512×512 RGBA  ──→   • Sampled by fragment shader per pixel
     array of bytes       • Mipmaps auto-generated (smaller versions
                            for distant surfaces to avoid aliasing)
```

---

## UV Coordinates

Every vertex in a Three.js geometry carries a **UV coordinate** — a 2D point where U runs 0→1 left-to-right across the texture, and V runs 0→1 bottom-to-top. The GPU interpolates UVs across the triangle between vertices, so every fragment on the surface gets an interpolated UV it can use to look up the texture.

For a `BoxGeometry`, Three.js auto-generates UVs so each face maps the full texture:

```
Face UV space:

V=1  ┌─────────────┐
     │             │
     │   texture   │
     │   maps here │
     │             │
V=0  └─────────────┘
     U=0          U=1
```

One problem: a 3×6m building face maps the entire texture once — meaning if the texture shows 3 bricks across, the whole wall shows only 3 bricks, each 1m wide. Unrealistic.

The solution is **texture repeat** (tiling):

```javascript
texture.wrapS = THREE.RepeatWrapping   // wrap in U direction
texture.wrapT = THREE.RepeatWrapping   // wrap in V direction
texture.repeat.set(3, 6)              // tile 3× horizontally, 6× vertically
```

Now UVs that exceed 1.0 wrap back to 0.0, so the texture repeats across the surface. A UV of (3.7, 2.4) samples the texture at (0.7, 0.4). The result: real-world-sized bricks tiling across any building, regardless of its dimensions.

### Per-instance repeat requires cloned textures

Here's the problem: `texture.repeat` is a property of the texture object. If two buildings share the same texture object and building A sets `repeat.set(3, 6)` while building B sets `repeat.set(5, 3)`, whichever runs last wins — both buildings use the same repeat.

The fix: **clone the texture** before setting per-instance properties:

```javascript
const sharedTexture = getTexture('brick').albedo   // cached, shared

// Per-building:
const myMap = sharedTexture.clone()
myMap.needsUpdate = true    // tells Three.js to upload the clone as a new GPU object
myMap.repeat.set(w, h)      // now only affects this building's material
```

`clone()` creates a new texture object that references the same underlying canvas data but has independent `repeat`, `offset`, and other transform properties. The canvas data itself is not duplicated — just the sampler state. Memory cost is minimal.

---

## Normal Maps: Faking Geometry with Light

A **normal map** stores a surface normal direction per pixel. Instead of the geometry's actual face normal (which is the same for every pixel on a flat polygon), the fragment shader uses the normal map's per-pixel value to calculate lighting.

The result: a perfectly flat polygon appears to have bumps, grooves, and ridges — no extra geometry required.

### Encoding normals as colours

A 3D normal vector has three components: X, Y, Z. Each is in the range [-1, +1]. To store this in an RGB texture (where each channel is 0–255), we remap:

```
R = (X + 1) / 2 × 255    →  X ∈ [-1,+1] maps to R ∈ [0,255]
G = (Y + 1) / 2 × 255    →  Y ∈ [-1,+1] maps to G ∈ [0,255]
B = (Z + 1) / 2 × 255    →  Z ∈ [-1,+1] maps to B ∈ [0,255]
```

A flat surface has a normal pointing straight out: (0, 0, 1). Encoded: R=128, G=128, B=255. This is why normal maps look purple/blue — most normals have a large Z component (pointing outward) which encodes as high blue values.

```
Flat normal map pixel:        Bumped normal map pixel:
R=128, G=128, B=255           R=180, G=120, B=220
(points straight out)         (tilted right and slightly down)
```

### Generating normal maps from height fields

`TextureGenerator.js` generates normal maps by first defining a **height field** — a function that returns a height value (0–1) for each pixel. Then it computes the **central difference** approximation of the surface gradient:

```javascript
// Sample heights of neighbours
const hLeft  = heightAt(x - 1, y)
const hRight = heightAt(x + 1, y)
const hUp    = heightAt(x, y - 1)
const hDown  = heightAt(x, y + 1)

// Central difference: rate of change in X and Y
const dX = (hLeft - hRight) * strength
const dY = (hUp   - hDown ) * strength
const dZ = 1.0               // Z is always positive (pointing outward)

// Normalize to unit length
const len = Math.sqrt(dX*dX + dY*dY + dZ*dZ)
const nx = dX / len,  ny = dY / len,  nz = dZ / len
```

`strength` controls how steep the normals are relative to height changes. Higher strength = more dramatic shading from small bumps.

For **brick**, the height field is binary: 1.0 over brick faces, 0.0 in mortar joints. The sharp height discontinuity at mortar edges produces steep normals that catch the sun light at a glancing angle — making the mortar look recessed even though the geometry is perfectly flat.

For **concrete**, the height field is multi-octave noise — producing subtle, irregular surface texture like real aggregate concrete.

### Seamless tiling in normal maps

Normal maps must tile seamlessly, or you'll see visible seams where tiles join. `makeNormal()` uses **wrap-around sampling** — when sampling a neighbour pixel at position `x-1`, if x=0, it wraps to `x = size-1` instead of going out of bounds:

```javascript
const xL = (px - 1 + size) % size   // wraps 0 → size-1
const xR = (px + 1) % size           // wraps size → 0
```

This makes the gradient computation continuous at texture edges, ensuring the normal map tiles without any seams.

---

## Procedural Noise: The Language of Natural Surfaces

Real surfaces are neither perfectly uniform nor completely random. They have **structure at multiple scales** — a brick wall has large bricks, medium surface roughness, and fine aggregate texture. This multi-scale character is what makes surfaces look organic.

### Value noise

Value noise is the building block. It:
1. Assigns a random value to each integer grid point using a hash function
2. Smoothly interpolates between neighbouring grid points using a polynomial curve

```javascript
function valueNoise(x, y) {
  const ix = Math.floor(x),  iy = Math.floor(y)
  const fx = x - ix,          fy = y - iy
  // Smoothstep: t² × (3 - 2t) — removes derivative discontinuities at grid edges
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return (
    hash(ix,   iy)   * (1-ux) * (1-uy) +
    hash(ix+1, iy)   * ux     * (1-uy) +
    hash(ix,   iy+1) * (1-ux) * uy     +
    hash(ix+1, iy+1) * ux     * uy
  )
}
```

The smoothstep function `t²(3-2t)` is critical. Linear interpolation between grid corners produces a visible "blocky" pattern — the derivative (rate of change) is discontinuous at integer coordinates. Smoothstep forces the derivative to zero at grid corners, making the surface smooth everywhere.

### Fractal Brownian Motion (fBm)

A single octave of noise gives large, smooth variation. Real surfaces need **detail at multiple scales**. fBm sums several octaves of noise with increasing frequency and decreasing amplitude:

```javascript
function fbm(x, y, octaves = 3) {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let i = 0; i < octaves; i++) {
    value     += valueNoise(x * frequency, y * frequency) * amplitude
    total     += amplitude
    amplitude *= 0.5    // each octave contributes half as much
    frequency *= 2.1    // each octave has twice the frequency (slightly > 2 avoids aliasing)
  }
  return value / total  // normalize to [0, 1]
}
```

Result: the large-scale variation comes from the first octave; medium detail from the second; fine grit from the third. This is what makes the concrete texture look like real concrete rather than smooth painted metal.

---

## PBR: Why We Switched from Lambert to Standard

`meshLambertMaterial` implements **Lambertian reflectance** — a model where light intensity is proportional to the cosine of the angle between the surface normal and the light direction. That's it. No specular highlights, no roughness, no metalness.

`meshStandardMaterial` implements **Physically Based Rendering (PBR)** with the **metalness-roughness** workflow. It models how light actually interacts with materials:

- **Diffuse component** — light scattered in all directions (same as Lambert)
- **Specular component** — light reflected in a mirror-like direction, modulated by roughness
- **Fresnel effect** — surfaces become more reflective at glancing angles (physically accurate)

### Roughness

Controls how mirror-like the specular highlight is:
- `roughness = 0` → perfect mirror, tiny bright dot highlight
- `roughness = 1` → fully diffuse, no specular highlight at all
- `roughness = 0.85` → matte surface with a broad, soft highlight (concrete)
- `roughness = 0.82` → slightly smoother surface (brick, which often has a hard fired finish)

Even on non-shiny surfaces, PBR's fresnel term adds a subtle sheen at glancing angles that makes surfaces look physically solid rather than like painted cardboard.

### Color as a tint multiplier

`meshStandardMaterial.color` multiplies with `map` (the albedo texture). A white tint (`#ffffff`) uses the texture colour as-is. A tinted value multiplies channel-by-channel:

```
finalColour = textureColour × materialColour

brick texture R = 0.78 (red-orange)
tint R = 0.77 ('#c09050' → R≈0.75)
final R = 0.78 × 0.75 = 0.585  (slightly darker, more copper-toned brick)
```

This is how buildings can share the same brick texture but still look distinct — each has a different tint that shifts the colour temperature.

---

## Canvas 2D API: Drawing Textures in Code

The browser's `Canvas 2D API` provides a drawing surface (`CanvasRenderingContext2D`) and a pixel buffer (`ImageData`). We use both:

**High-level drawing** for pattern-based textures (brick, stone):
```javascript
ctx.fillStyle = '#a09282'
ctx.fillRect(x, y, w, h)
```

**Direct pixel manipulation** via `ImageData` for noise-based textures:
```javascript
const img = ctx.createImageData(width, height)
const d   = img.data  // Uint8ClampedArray, length = w × h × 4

// Set pixel at (px, py):
const i = (py * width + px) * 4
d[i]     = red   // 0–255
d[i + 1] = green
d[i + 2] = blue
d[i + 3] = 255   // alpha (always opaque)

ctx.putImageData(img, 0, 0)
```

`Uint8ClampedArray` automatically clamps values to [0, 255] — writing `d[i] = 300` stores 255. This prevents overflow without needing explicit `Math.min/max` calls on every pixel.

Direct pixel manipulation is used for noise textures because the Canvas 2D drawing API doesn't provide per-pixel random access. For the brick albedo, the drawing API is sufficient because we're filling rectangles.

---

## The Texture Cache

Generating a 512×512 texture involves 262,144 pixel calculations — a few milliseconds of CPU time. Generating all 7 textures takes ~20–30ms on first load. Without caching, that cost would repeat every time a component re-renders.

`TextureGenerator.js` uses a module-level `Map` as a cache:

```javascript
const cache = new Map()

export function getTexture(key) {
  if (cache.has(key)) return cache.get(key)   // O(1) lookup
  
  const entry = { albedo: makeAlbedo(...), normal: makeNormal(...) }
  cache.set(key, entry)
  return entry
}
```

Module-level variables in JavaScript are singletons — they live for the lifetime of the browser tab. The cache is populated during the first frame (when Three.js first renders the scene) and stays populated permanently. All subsequent calls to `getTexture()` return cached objects with zero computation cost.

---

## Material Sharing vs Cloning: When to Do Which

| Situation | Strategy | Why |
|---|---|---|
| Rocks: same texture, same repeat | Share one material | Identical render state = no duplication needed |
| Trees: same bark texture per tree | Share one material | Same repeat looks right on all trunks |
| Buildings: same texture, different repeat | Clone texture, create per-building material | Each building needs unique `repeat` for correct scale |
| Buildings: different texture types | Separate material per type | Different shader uniforms, different GPU state |

The key rule: if two meshes would have identical render state (same texture, same repeat, same roughness, same colour), they can share a material. If anything differs, they need separate material instances — but sharing the underlying texture data is still fine and avoids GPU memory duplication.

---

## Files Changed

| File | What changed |
|---|---|
| `src/systems/TextureGenerator.js` | New — generates brick, concrete, plaster, grass, bark, leaf, stone textures + normal maps |
| `src/components/Buildings.jsx` | `meshLambertMaterial` → `meshStandardMaterial` with texture + normal map + per-instance repeat |
| `src/components/World.jsx` | Flat green Lambert → tiling grass texture on `meshStandardMaterial` |
| `src/components/Trees.jsx` | Bark texture on trunks, leaves texture on canopies, shared materials |
| `src/components/Rocks.jsx` | Stone texture + normal map, single shared material |
