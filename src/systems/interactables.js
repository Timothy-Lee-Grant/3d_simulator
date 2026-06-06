/**
 * interactables.js — a module-level registry of Three.js objects the player can interact with.
 *
 * ── Why a module-level registry? ─────────────────────────────────────────────
 *
 * The raycaster in Player.jsx needs a list of Three.js `Object3D` instances to
 * test against every frame. React refs provide those instances, but Player.jsx
 * has no parent-child relationship with the NPC components that own the refs.
 *
 * Options considered:
 *   A) Pass refs down through App → Player (prop drilling, tight coupling)
 *   B) Put refs in a React context (requires Provider wrapping, context re-renders)
 *   C) Put refs in Zustand (Zustand stores plain JS; Three.js objects are not
 *      serialisable and may cause issues with devtools)
 *   D) Module-level Map (simple, zero overhead, no React coupling)
 *
 * Option D wins for this use case because:
 *   - Three.js objects are not React state — they don't need to trigger renders
 *   - The registry only needs to be read inside useFrame (never causes re-renders)
 *   - NPC components can register/deregister on mount/unmount with no ceremony
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 * Registering (in NPC.jsx useEffect):
 *   import { registerInteractable, deregisterInteractable } from '../systems/interactables'
 *   registerInteractable('npc_01', groupRef.current, { name: 'Stranger' })
 *   return () => deregisterInteractable('npc_01')
 *
 * Querying (in useRaycast.js):
 *   import { getInteractableObjects, getInteractableMeta } from '../systems/interactables'
 *   const objects = getInteractableObjects()   // Object3D[] — pass to raycaster
 */

// Map<id: string, { object: Object3D, meta: { name: string } }>
const registry = new Map()

/**
 * Register a Three.js Object3D as an interactable target.
 * @param {string}   id      Unique identifier for this interactable (e.g. 'npc_01')
 * @param {Object3D} object  The Three.js group/mesh to raycast against
 * @param {object}   meta    Arbitrary metadata — at minimum { name: string }
 */
export function registerInteractable(id, object, meta) {
  registry.set(id, { object, meta })
}

/**
 * Deregister a previously registered interactable (call on component unmount).
 * @param {string} id
 */
export function deregisterInteractable(id) {
  registry.delete(id)
}

/**
 * Returns all registered Three.js objects as a flat array.
 * Used by the raycaster: `raycaster.intersectObjects(getInteractableObjects(), true)`
 * @returns {Object3D[]}
 */
export function getInteractableObjects() {
  return Array.from(registry.values()).map(entry => entry.object)
}

/**
 * Given a Three.js Object3D (or any of its descendants) returned by the raycaster,
 * find which registered interactable it belongs to.
 *
 * The raycaster's `intersectObjects(objects, recursive=true)` returns the deepest
 * descendant mesh that was hit — not necessarily the root group that was registered.
 * This function walks the hit object's ancestry until it finds a registered root.
 *
 * @param {Object3D} hitObject  The object returned by raycaster.intersectObjects
 * @returns {{ id: string, meta: object } | null}
 */
export function findInteractableByHit(hitObject) {
  // Walk up the scene graph from the hit object
  let current = hitObject
  while (current) {
    for (const [id, entry] of registry.entries()) {
      if (entry.object === current) {
        return { id, meta: entry.meta }
      }
    }
    current = current.parent
  }
  return null
}
