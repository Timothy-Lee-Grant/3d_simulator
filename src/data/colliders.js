/**
 * colliders.js — AABB collision boxes for all static world geometry.
 *
 * Each collider is { minX, maxX, minZ, maxZ } — a flat rectangle on the XZ
 * plane. Y bounds are not stored here: the ground plane is handled by the
 * gravity/grounding system; we only block lateral movement with these boxes.
 *
 * Derived from the same position/size data used by Buildings.jsx, Trees.jsx,
 * and Rocks.jsx so the collision boxes automatically match the visible geometry.
 */

// ── Buildings ─────────────────────────────────────────────────────────────
// Mirrors the BUILDINGS array in Buildings.jsx exactly.
// pos = [x, z], dims = [w, h, d] — h is ignored for XZ collision.
const BUILDING_DATA = [
  { pos: [-5,  -10], dims: [3, 6, 3] },
  { pos: [ 6,   -9], dims: [4, 4, 4] },
  { pos: [-9,  -16], dims: [2, 9, 2] },
  { pos: [10,   -5], dims: [5, 3, 3] },
  { pos: [-3,  -22], dims: [6, 5, 4] },
  { pos: [16,  -12], dims: [3, 8, 3] },
  { pos: [-15,  -8], dims: [4, 4, 5] },
  { pos: [  3, -28], dims: [7, 3, 5] },
  { pos: [-11, -26], dims: [3, 6, 3] },
  { pos: [ 21, -20], dims: [4, 7, 4] },
  { pos: [-21, -22], dims: [5, 4, 3] },
  { pos: [  9, -33], dims: [3, 9, 3] },
  { pos: [-18, -35], dims: [6, 5, 6] },
  { pos: [ 28, -10], dims: [4, 5, 4] },
  { pos: [-28, -12], dims: [3, 7, 3] },
  { pos: [ 14, -38], dims: [5, 6, 4] },
]

// ── Trees ─────────────────────────────────────────────────────────────────
// Trunk collision radius is generous (0.5) to include the visible trunk width
// plus a small buffer so the player can't clip into the canopy.
const TREE_POSITIONS = [
  [ 4,  -6],
  [-7, -13],
  [12, -18],
  [-5, -28],
  [20,  -8],
  [-25,-18],
  [ 6, -35],
  [-14,-40],
]
const TREE_RADIUS = 0.50

// ── Rocks ─────────────────────────────────────────────────────────────────
// Mirrors the ROCKS array in Rocks.jsx.
const ROCK_DATA = [
  { pos: [ 3,  -4],  radius: 0.45 },
  { pos: [-2,  -3],  radius: 0.60 },
  { pos: [ 7,  -4],  radius: 0.35 },
  { pos: [-13, -5],  radius: 0.55 },
  { pos: [11, -13],  radius: 0.40 },
]

// ── Derive AABB boxes ─────────────────────────────────────────────────────

const buildingColliders = BUILDING_DATA.map(({ pos: [x, z], dims: [w, , d] }) => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
}))

const treeColliders = TREE_POSITIONS.map(([x, z]) => ({
  minX: x - TREE_RADIUS,
  maxX: x + TREE_RADIUS,
  minZ: z - TREE_RADIUS,
  maxZ: z + TREE_RADIUS,
}))

const rockColliders = ROCK_DATA.map(({ pos: [x, z], radius }) => ({
  minX: x - radius,
  maxX: x + radius,
  minZ: z - radius,
  maxZ: z + radius,
}))

/**
 * All static world colliders combined into one flat array.
 * Passed to resolveXZ() in collision.js every movement frame.
 */
export const WORLD_COLLIDERS = [
  ...buildingColliders,
  ...treeColliders,
  ...rockColliders,
]
