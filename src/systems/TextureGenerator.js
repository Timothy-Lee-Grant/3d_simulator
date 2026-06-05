/**
 * TextureGenerator.js
 *
 * Generates every game texture procedurally using the Canvas 2D API.
 * No image files required — all textures are synthesized at runtime
 * and handed to Three.js as CanvasTexture objects.
 *
 * ── What a texture actually is ───────────────────────────────────────────
 *
 * A texture is nothing more than a 2D array of pixel values stored in GPU
 * memory. Three.js's CanvasTexture takes a <canvas> element, reads its
 * pixel data, and uploads it to the GPU on first use.
 *
 * Each pixel in a Three.js texture has four channels: R, G, B, A (0–255).
 * An albedo (color) map uses RGB as actual colors.
 * A normal map uses RGB to encode a 3D surface direction:
 *   R → X component of the normal vector (-1…+1, stored as 0…255)
 *   G → Y component
 *   B → Z component (usually near 255 = pointing straight out of the surface)
 *
 * ── UV Coordinates ───────────────────────────────────────────────────────
 *
 * Every vertex in a Three.js geometry has a UV coordinate — a 2D point
 * (U from 0 to 1 left-to-right, V from 0 to 1 bottom-to-top) that tells
 * the GPU where on the texture this vertex maps to. The GPU interpolates
 * UVs between vertices and samples the texture at each fragment (pixel).
 *
 * BoxGeometry automatically generates UVs for each face: each face maps
 * the full texture (0,0)→(1,1). To make the texture tile N times across
 * a face, set texture.repeat.set(N, N) — the GPU wraps UV coordinates
 * that exceed 1.0 back around (thanks to THREE.RepeatWrapping).
 *
 * ── Normal Maps ──────────────────────────────────────────────────────────
 *
 * A normal map stores per-pixel surface normals, tricking the lighting
 * math into thinking a flat polygon has bumps and grooves — without
 * adding any geometry. We compute them from a height field using the
 * central difference method:
 *
 *   gradient_x = height(x-1, y) - height(x+1, y)
 *   gradient_y = height(x, y-1) - height(x, y+1)
 *   normal      = normalize( gradient_x, gradient_y, 1/strength )
 *
 * The resulting X,Y,Z vector is encoded into RGB for storage.
 *
 * ── Texture Cache ────────────────────────────────────────────────────────
 *
 * Generating textures is CPU-intensive. We use a module-level Map so each
 * texture key is generated exactly once and returned from cache on every
 * subsequent call. The cache lives for the lifetime of the page.
 */

import * as THREE from 'three'

// ── Module-level cache ────────────────────────────────────────────────────

const cache = new Map()

// ── Noise utilities ───────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random hash from two integers.
 * Returns a float in [0, 1). Same inputs always give the same output.
 * Uses the sine trick — fast and good enough for texture generation.
 */
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Smooth value noise via bilinear interpolation of hashed grid corners.
 * Returns a float in [0, 1). Smooth across the continuous domain (x, y).
 *
 * "Value noise" = sample a hash at integer grid corners, interpolate between them.
 * The smoothstep function (3t² - 2t³) prevents derivative discontinuities at corners.
 */
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  // Smoothstep: eliminates the "blocky" look of linear interpolation
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return (
    hash(ix,     iy)     * (1 - ux) * (1 - uy) +
    hash(ix + 1, iy)     * ux       * (1 - uy) +
    hash(ix,     iy + 1) * (1 - ux) * uy       +
    hash(ix + 1, iy + 1) * ux       * uy
  )
}

/**
 * Fractal Brownian Motion: sums several octaves of noise at increasing
 * frequencies and decreasing amplitudes. Produces natural-looking
 * irregular surfaces (rock, bark, concrete aggregate).
 *
 *   octaves=1  → smooth, low-frequency variation
 *   octaves=4  → fine-grained rocky texture
 */
function fbm(x, y, octaves = 3) {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let i = 0; i < octaves; i++) {
    value     += valueNoise(x * frequency, y * frequency) * amplitude
    total     += amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return value / total
}

// ── Canvas helpers ────────────────────────────────────────────────────────

/**
 * Creates a CanvasTexture from a draw function.
 * @param {number} w  Canvas width in pixels
 * @param {number} h  Canvas height in pixels
 * @param {function} drawFn  Receives (ctx, w, h) — draw the albedo here
 */
function makeAlbedo(w, h, drawFn) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  drawFn(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Generates a roughness map from a scalar roughness function.
 *
 * Three.js MeshStandardMaterial reads the GREEN channel of roughnessMap
 * and multiplies it by material.roughness to get the final per-pixel value.
 * We output grayscale (R = G = B) so the green channel carries the right value.
 *
 * Convention: 0 = perfectly smooth (mirror), 1 = fully diffuse/matte.
 *
 * @param {number} size
 * @param {function} roughnessFn  (px, py, size) → float 0–1
 */
function makeRoughness(size, roughnessFn) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const v = Math.round(roughnessFn(px, py, size) * 255)
      const i = (py * size + px) * 4
      d[i] = d[i + 1] = d[i + 2] = v   // grayscale — green channel = roughness value
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * Generates a normal map from a scalar height function.
 * @param {number} size  Both width and height (must be square)
 * @param {function} heightAt  (px, py, size) → float 0–1  (0 = depressed, 1 = raised)
 * @param {number} strength  How pronounced the bumps appear. Higher = more extreme.
 */
function makeNormal(size, heightAt, strength = 6) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Wrap-around sampling makes the normal map seamlessly tileable
      const xL = (px - 1 + size) % size
      const xR = (px + 1) % size
      const yU = (py - 1 + size) % size
      const yD = (py + 1) % size

      // Central difference approximation of the height field gradient
      const dX = (heightAt(xL, py, size) - heightAt(xR, py, size)) * strength
      const dY = (heightAt(px, yU, size) - heightAt(px, yD, size)) * strength
      const dZ = 1.0

      // Normalize to unit length
      const len = Math.sqrt(dX * dX + dY * dY + dZ * dZ)
      const nx = dX / len
      const ny = dY / len
      const nz = dZ / len

      // Encode: map [-1, +1] → [0, 255]
      const i = (py * size + px) * 4
      d[i]     = Math.round((nx * 0.5 + 0.5) * 255)  // R = X
      d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)  // G = Y
      d[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)  // B = Z
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// ── Brick ─────────────────────────────────────────────────────────────────

// Brick layout constants (pixels in a 512×512 tile)
const BK_W  = 170  // brick width (px) — gives ~3 bricks per tile → ~1 brick per 0.33m
const BK_H  = 52   // brick height (~1:3 h:w ratio, traditional proportions)
const BK_M  = 8    // mortar joint thickness (px)

/**
 * Returns the brick-local coordinates for a given pixel.
 * Running bond: every other row is offset by half a brick width.
 */
function brickLocalCoords(px, py) {
  const row    = Math.floor(py / BK_H)
  const offset = (row % 2) * Math.floor(BK_W / 2)
  const localX = ((px + offset) % BK_W + BK_W) % BK_W
  const localY = py % BK_H
  return { localX, localY, row }
}

/** True if this pixel falls inside a mortar joint. */
function inMortar(px, py) {
  const { localX, localY } = brickLocalCoords(px, py)
  return localX < BK_M || localX > BK_W - BK_M ||
         localY < BK_M || localY > BK_H - BK_M
}

/** Height field for the brick normal map: 1=brick face, 0=mortar. */
function brickHeight(px, py, _size) {
  return inMortar(px, py) ? 0.0 : 1.0
}

function drawBrick(ctx, w, h) {
  // Mortar fill
  ctx.fillStyle = '#a09282'
  ctx.fillRect(0, 0, w, h)

  for (let py = 0; py < h; py += BK_H) {
    const row    = Math.floor(py / BK_H)
    const offset = (row % 2) * Math.floor(BK_W / 2)

    for (let px = -BK_W; px < w + BK_W; px += BK_W) {
      const bx = px - offset
      // Each brick gets a slightly different warm-red hue using hash noise
      const n  = hash(Math.round(bx / BK_W), row)
      const r  = Math.round(150 + n * 55)
      const g  = Math.round(72  + n * 35)
      const b  = Math.round(52  + n * 25)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(
        bx + BK_M, py + BK_M,
        BK_W - BK_M * 2, BK_H - BK_M * 2
      )
    }
  }
}

// ── Concrete ──────────────────────────────────────────────────────────────

function concreteHeight(px, py, size) {
  // Two octaves of smooth noise for a subtle pitted surface
  return fbm(px / size * 6, py / size * 6, 2)
}

function drawConcrete(ctx, w, h) {
  const img = ctx.createImageData(w, h)
  const d   = img.data

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n = fbm(px / w * 5, py / h * 5, 3)
      // Faint horizontal formwork marks every 48px
      const band = Math.abs(Math.sin((py / 48) * Math.PI)) * 0.06

      const base = Math.round(118 + n * 38 - band * 255)
      const i    = (py * w + px) * 4
      d[i]     = base
      d[i + 1] = base
      d[i + 2] = base + 5
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
}

// ── Plaster ───────────────────────────────────────────────────────────────

function drawPlaster(ctx, w, h) {
  const img = ctx.createImageData(w, h)
  const d   = img.data

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n  = fbm(px / w * 8, py / h * 8, 3)
      const rv = Math.round(210 + n * 30)
      const gv = Math.round(195 + n * 25)
      const bv = Math.round(175 + n * 20)
      const i  = (py * w + px) * 4
      d[i]     = rv
      d[i + 1] = gv
      d[i + 2] = bv
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
}

function plasterHeight(px, py, size) {
  return fbm(px / size * 10, py / size * 10, 3)
}

// ── Grass ─────────────────────────────────────────────────────────────────

function drawGrass(ctx, w, h) {
  const img = ctx.createImageData(w, h)
  const d   = img.data

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n  = fbm(px / w * 6, py / h * 6, 4)
      // Variation between dark olive and fresh green
      const rv = Math.round(48  + n * 38)
      const gv = Math.round(100 + n * 55)
      const bv = Math.round(40  + n * 22)
      const i  = (py * w + px) * 4
      d[i]     = rv
      d[i + 1] = gv
      d[i + 2] = bv
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)

  // Overlay sparse blade strokes
  ctx.globalAlpha = 0.12
  for (let i = 0; i < 1800; i++) {
    const bx  = Math.random() * w
    const by  = Math.random() * h
    const len = 4 + Math.random() * 10
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.9
    const n   = hash(Math.round(bx), Math.round(by))
    ctx.strokeStyle = n > 0.5 ? '#5a9e4a' : '#3d7a32'
    ctx.lineWidth   = 0.8
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ── Bark ──────────────────────────────────────────────────────────────────

function drawBark(ctx, w, h) {
  const img = ctx.createImageData(w, h)
  const d   = img.data

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // Vertical ridges: low-frequency horizontal noise, high-frequency vertical
      const ridge = valueNoise(px / w * 3, py / h * 14)
      const fine  = fbm(px / w * 8, py / h * 20, 2) * 0.3

      const n  = ridge * 0.7 + fine
      const rv = Math.round(72  + n * 55)
      const gv = Math.round(42  + n * 35)
      const bv = Math.round(18  + n * 18)
      const i  = (py * w + px) * 4
      d[i]     = rv
      d[i + 1] = gv
      d[i + 2] = bv
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
}

function barkHeight(px, py, size) {
  return valueNoise(px / size * 4, py / size * 16)
}

// ── Leaves ────────────────────────────────────────────────────────────────

function drawLeaves(ctx, w, h) {
  const img = ctx.createImageData(w, h)
  const d   = img.data

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n  = fbm(px / w * 9, py / h * 9, 3)
      const rv = Math.round(28  + n * 50)
      const gv = Math.round(88  + n * 70)
      const bv = Math.round(22  + n * 30)
      const i  = (py * w + px) * 4
      d[i]     = rv
      d[i + 1] = gv
      d[i + 2] = bv
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
}

// ── Stone ─────────────────────────────────────────────────────────────────

// Irregular stone block layout
const ST_W = 128
const ST_H = 90
const ST_M = 10

function stoneLocalCoords(px, py) {
  const row    = Math.floor(py / ST_H)
  const n      = hash(row, 0)
  const offset = Math.round(n * ST_W * 0.6)
  const localX = ((px + offset) % ST_W + ST_W) % ST_W
  const localY = py % ST_H
  return { localX, localY, row }
}

function stoneHeight(px, py, size) {
  const { localX, localY } = stoneLocalCoords(px, py)
  const inJoint = localX < ST_M || localX > ST_W - ST_M ||
                  localY < ST_M || localY > ST_H - ST_M
  if (inJoint) return 0.1
  // Add surface variation within each stone face
  return 0.7 + fbm(px / size * 12, py / size * 12, 2) * 0.3
}

function drawStone(ctx, w, h) {
  // Fill joint color
  ctx.fillStyle = '#5a5550'
  ctx.fillRect(0, 0, w, h)

  for (let py = 0; py < h; py += ST_H) {
    const row    = Math.floor(py / ST_H)
    const n      = hash(row, 0)
    const offset = Math.round(n * ST_W * 0.6)

    for (let px = -ST_W; px < w + ST_W; px += ST_W) {
      const bx  = px - offset
      const rn  = hash(Math.round(bx / ST_W) + row * 7, row)
      const base = Math.round(100 + rn * 55)
      ctx.fillStyle = `rgb(${base},${base - 4},${base - 8})`
      ctx.fillRect(
        bx + ST_M, py + ST_M,
        ST_W - ST_M * 2, ST_H - ST_M * 2
      )
    }
  }
}

// ── Roughness functions ───────────────────────────────────────────────────
//
// Output: 0.0 = mirror-smooth, 1.0 = fully matte/diffuse.
//
// Brick: fired clay face ~0.72 (slightly glazed), granular mortar ~0.96.
// Concrete: mostly rough (0.87–0.95) with aggregate variation.
// Stone: slightly smoother face (0.78–0.88), very rough joints.

function brickRoughness(px, py, _size) {
  if (inMortar(px, py)) return 0.96
  // Subtle per-brick variation using a coarse hash grid
  return 0.70 + hash(Math.floor(px / 20), Math.floor(py / 20)) * 0.08
}

function concreteRoughness(px, py, size) {
  return 0.87 + fbm(px / size * 8, py / size * 8, 2) * 0.08
}

function stoneRoughness(px, py, size) {
  const { localX, localY } = stoneLocalCoords(px, py)
  const inJoint = localX < ST_M || localX > ST_W - ST_M ||
                  localY < ST_M || localY > ST_H - ST_M
  if (inJoint) return 0.96
  return 0.78 + fbm(px / size * 10, py / size * 10, 2) * 0.10
}

// ── Public API ────────────────────────────────────────────────────────────

const TEXTURE_DEFS = {
  brick:    { size: 512, drawFn: drawBrick,    heightFn: brickHeight,    normalStrength: 8, roughnessFn: brickRoughness    },
  concrete: { size: 512, drawFn: drawConcrete, heightFn: concreteHeight, normalStrength: 3, roughnessFn: concreteRoughness },
  plaster:  { size: 512, drawFn: drawPlaster,  heightFn: plasterHeight,  normalStrength: 2, roughnessFn: null              },
  grass:    { size: 512, drawFn: drawGrass,    heightFn: null,           normalStrength: 0, roughnessFn: null              },
  bark:     { size: 256, drawFn: drawBark,     heightFn: barkHeight,     normalStrength: 5, roughnessFn: null              },
  leaves:   { size: 256, drawFn: drawLeaves,   heightFn: null,           normalStrength: 0, roughnessFn: null              },
  stone:    { size: 512, drawFn: drawStone,    heightFn: stoneHeight,    normalStrength: 7, roughnessFn: stoneRoughness    },
}

/**
 * Returns { albedo, normal, roughness } for the given texture key.
 * All are THREE.CanvasTexture with RepeatWrapping set.
 * `normal` and `roughness` are null when not defined for that surface type.
 * Results are cached — each texture is generated exactly once per session.
 *
 * @param {'brick'|'concrete'|'plaster'|'grass'|'bark'|'leaves'|'stone'} key
 * @returns {{ albedo: THREE.CanvasTexture, normal: THREE.CanvasTexture|null, roughness: THREE.CanvasTexture|null }}
 */
export function getTexture(key) {
  if (cache.has(key)) return cache.get(key)

  const def = TEXTURE_DEFS[key]
  if (!def) throw new Error(`TextureGenerator: unknown key "${key}"`)

  const albedo = makeAlbedo(def.size, def.size, def.drawFn)

  const normal = def.heightFn
    ? makeNormal(def.size, def.heightFn, def.normalStrength)
    : null

  const roughness = def.roughnessFn
    ? makeRoughness(def.size, def.roughnessFn)
    : null

  const entry = { albedo, normal, roughness }
  cache.set(key, entry)
  return entry
}

/**
 * Dispose all cached textures and clear the cache.
 * Call this when the scene is torn down to free GPU memory.
 */
export function disposeTextures() {
  cache.forEach(({ albedo, normal, roughness }) => {
    albedo.dispose()
    normal?.dispose()
    roughness?.dispose()
  })
  cache.clear()
}
