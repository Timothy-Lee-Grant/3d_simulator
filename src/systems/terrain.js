/**
 * terrain.js — deterministic procedural terrain height function.
 *
 * This module is the single source of truth for terrain elevation.
 * It is imported by BOTH:
 *
 *   • World.jsx  — to displace the PlaneGeometry vertices at startup
 *   • Player.jsx — to query the ground height at runtime every frame
 *
 * Because both consumers use the SAME function, the visual geometry and
 * the player's physical ground are always identical. There is no
 * separate "physics mesh" — the rendering IS the physics.
 *
 * ── Noise Algorithm ────────────────────────────────────────────────────
 *
 * We implement Value Noise from scratch (no external package) using the
 * same pattern already established in TextureGenerator.js:
 *
 *   hash(x, y)         → deterministic pseudo-random float in [0, 1)
 *   valueNoise(x, y)   → smooth value noise via bilinear + smoothstep
 *   getTerrainHeight   → FBM (fractal Brownian motion) from multiple
 *                        noise octaves, with a radial spawn flatten
 *
 * ── Fractional Brownian Motion (FBM) ───────────────────────────────────
 *
 * FBM combines multiple "octaves" of noise at increasing frequencies
 * and decreasing amplitudes. This produces the characteristic layered
 * look of natural terrain:
 *
 *   Octave 1: scale 0.007, amplitude 4.5  → large hills and valleys
 *   Octave 2: scale 0.022, amplitude 1.4  → medium undulations
 *   Octave 3: scale 0.07,  amplitude 0.4  → small surface bumps
 *   Octave 4: scale 0.19,  amplitude 0.1  → micro surface detail
 *
 * The final height is the sum of all octaves.
 *
 * ── Spawn Flattening ───────────────────────────────────────────────────
 *
 * Buildings, NPCs, and the player all start near the origin (0, 0). A
 * bumpy spawning area would cause objects to clip into terrain and the
 * player to begin the game standing inside a hillside.
 *
 * Solution: multiply the noise output by a radial smoothstep that is 0
 * at the origin, rises to 1 at FLAT_RADIUS, and stays at 1 beyond.
 * This creates a flat disc at spawn that seamlessly blends into the
 * surrounding hills.
 *
 *   t  = clamp(dist / FLAT_RADIUS, 0, 1)
 *   st = smoothstep(t) = 3t² − 2t³          (C1 continuous, no sharp edge)
 *
 *   height = rawNoise × st
 *
 * ── Constants ──────────────────────────────────────────────────────────
 *
 * TERRAIN_SIZE and TERRAIN_SEGMENTS are exported so World.jsx and any
 * future LOD system can reference the same values.
 */

// ── Noise primitives ──────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random hash.
 * Same as in TextureGenerator.js — sine-based, returns [0, 1).
 */
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Smooth value noise via bilinear interpolation of hashed grid corners.
 * Returns [0, 1). Uses smoothstep to remove derivative discontinuities
 * at grid cell boundaries (avoids the "blocky" look of linear lerp).
 */
function valueNoise(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy

  // Smoothstep: 3t² − 2t³  (maps [0,1] → [0,1] with zero slope at endpoints)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  return (
    hash(ix,     iy)     * (1 - ux) * (1 - uy) +
    hash(ix + 1, iy)     * ux       * (1 - uy) +
    hash(ix,     iy + 1) * (1 - ux) * uy       +
    hash(ix + 1, iy + 1) * ux       * uy
  )
}

// ── Terrain constants ─────────────────────────────────────────────────────

/**
 * XZ extent of the terrain mesh in world units.
 * World boundary is ±120 (enforced in Player.jsx), so 280 gives comfortable
 * overlap without wasting geometry.
 */
export const TERRAIN_SIZE = 280

/**
 * Number of vertex subdivisions along each axis of the PlaneGeometry.
 * 150×150 = 22,500 quads. Fine enough for smooth hills, cheap enough
 * that even mid-range GPUs don't flinch.
 */
export const TERRAIN_SEGMENTS = 150

/**
 * Radius around world origin where terrain is completely flat (units).
 * Set to 52 to fully cover all buildings (furthest at ~42 units) plus
 * a buffer. Beyond this radius, noise transitions in smoothly.
 */
const FLAT_RADIUS = 52

/**
 * Noise octaves — each adds a layer of detail.
 * { scale: how compressed the noise is, amplitude: max contribution in units }
 */
const OCTAVES = [
  { scale: 0.007, amplitude: 4.5  },  // rolling hills
  { scale: 0.022, amplitude: 1.4  },  // medium undulation
  { scale: 0.070, amplitude: 0.40 },  // surface bumps
  { scale: 0.190, amplitude: 0.10 },  // fine surface grain
]

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the terrain Y-elevation at world (x, z).
 *
 * Call from:
 *   World.jsx  — on every vertex of the PlaneGeometry (once, at init)
 *   Player.jsx — every frame for ground detection
 *   Trees/Rocks — once per object at mount for ground-snapping
 *
 * @param {number} x  World X coordinate
 * @param {number} z  World Z coordinate
 * @returns {number}  Height in world units (Y axis). 0 at flat spawn zone.
 */
export function getTerrainHeight(x, z) {
  // Sum noise octaves — valueNoise returns [0,1] so we bias to [-0.5, 0.5]
  // to get hills both above and below zero.
  let h = 0
  for (const { scale, amplitude } of OCTAVES) {
    // Add 100 offset to avoid the degenerate origin of the hash function
    h += (valueNoise(x * scale + 100, z * scale + 100) - 0.5) * 2 * amplitude
  }

  // Radial smoothstep flatten — zero at origin, rises to 1 at FLAT_RADIUS
  const dist = Math.sqrt(x * x + z * z)
  const t    = Math.min(1, dist / FLAT_RADIUS)
  const st   = t * t * (3 - 2 * t)  // smoothstep

  return h * st
}
