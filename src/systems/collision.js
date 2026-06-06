/**
 * collision.js — AABB collision detection and XZ slide resolution.
 *
 * ── Concept ──────────────────────────────────────────────────────────────
 *
 * An Axis-Aligned Bounding Box (AABB) is the simplest 3D collision shape: a
 * box whose faces are parallel to the world axes. Two AABBs overlap when they
 * intersect on ALL three axes simultaneously. On the XZ plane:
 *
 *   overlap = (aMinX < bMaxX && aMaxX > bMinX) &&
 *             (aMinZ < bMaxZ && aMaxZ > bMinZ)
 *
 * The player's footprint is a square of side 2×PLAYER_RADIUS, centred at
 * (camera.position.x, camera.position.z).
 *
 * ── Slide Resolution ─────────────────────────────────────────────────────
 *
 * Stopping dead when any axis collides feels terrible. Instead we test each
 * axis independently:
 *
 *   1. Try (newX, oldZ): if no collision → allow X movement
 *   2. Try (resolvedX, newZ): if no collision → allow Z movement
 *
 * The result is "wall sliding" — the player glides along building faces
 * instead of halting when they brush a corner.
 */

// Half-width of the player's XZ collision square (metres).
// 0.35 gives a comfortable margin around the camera without feeling too wide.
const PLAYER_RADIUS = 0.35

/**
 * Returns true if the player square centred at (x, z) overlaps any collider.
 * @param {number}   x
 * @param {number}   z
 * @param {object[]} colliders  Array of { minX, maxX, minZ, maxZ }
 */
function overlapsAny(x, z, colliders) {
  const pMinX = x - PLAYER_RADIUS
  const pMaxX = x + PLAYER_RADIUS
  const pMinZ = z - PLAYER_RADIUS
  const pMaxZ = z + PLAYER_RADIUS

  for (const box of colliders) {
    if (pMinX < box.maxX && pMaxX > box.minX &&
        pMinZ < box.maxZ && pMaxZ > box.minZ) {
      return true
    }
  }
  return false
}

/**
 * Given a desired new position and the last safe position, return the
 * position after resolving collisions with axis-independent slide.
 *
 * @param {number}   newX       Desired X after movement
 * @param {number}   newZ       Desired Z after movement
 * @param {number}   oldX       Previous safe X
 * @param {number}   oldZ       Previous safe Z
 * @param {object[]} colliders  Array of { minX, maxX, minZ, maxZ }
 * @returns {{ x: number, z: number }}  Resolved position
 */
export function resolveXZ(newX, newZ, oldX, oldZ, colliders) {
  // Test X axis: keep Z at old value to isolate the X movement
  const resolvedX = overlapsAny(newX, oldZ, colliders) ? oldX : newX

  // Test Z axis: use resolvedX (not oldX) so corner handling is correct
  const resolvedZ = overlapsAny(resolvedX, newZ, colliders) ? oldZ : newZ

  return { x: resolvedX, z: resolvedZ }
}
