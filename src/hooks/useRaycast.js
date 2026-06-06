/**
 * useRaycast — fires a ray from the camera center forward every frame
 * and updates the interaction store with what (if anything) the player
 * is currently looking at within interaction range.
 *
 * ── How the ray is constructed ────────────────────────────────────────────
 *
 * `raycaster.setFromCamera({ x: 0, y: 0 }, camera)` fires a ray through
 * normalised device coordinates (NDC) (0, 0) — the exact center of the viewport,
 * which is where the crosshair sits. Three.js deprojects this point through the
 * camera's inverse projection matrix, producing a ray origin at the camera and
 * a direction along the camera's forward vector.
 *
 * This is the standard first-person interaction approach: what you're pointing
 * your crosshair at is what you can interact with.
 *
 * ── Performance note ──────────────────────────────────────────────────────
 *
 * We only raycast against the `interactableObjects` list — typically 3-10 meshes.
 * Raycasting against the entire scene every frame would be expensive (hundreds of
 * meshes). The explicit opt-in list keeps the test set small.
 *
 * The Raycaster instance is created once with `useMemo` so it isn't reallocated
 * every frame.
 *
 * ── Separation of concerns ────────────────────────────────────────────────
 *
 * This hook only reads the scene and writes to the store — it has no side effects
 * on Three.js objects. Visual feedback (highlight ring) is handled in NPC.jsx by
 * reading the same store. This keeps the raycasting logic decoupled from rendering.
 */

import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster } from 'three'
import { getInteractableObjects, findInteractableByHit } from '../systems/interactables'
import { useInteractionStore } from '../store/useInteractionStore'

// Maximum distance (world units) at which the player can interact with an object.
// 3 units ≈ arm's reach for a character with eye height 1.7 units.
const INTERACTION_RANGE = 3.0

// NDC center — the crosshair position in normalised device coordinates.
// (0, 0) is the exact center of the viewport.
const NDC_CENTER = { x: 0, y: 0 }

export default function useRaycast() {
  const { camera } = useThree()
  const setLookingAt = useInteractionStore(state => state.setLookingAt)

  // Create the Raycaster once — reused every frame
  const raycaster = useMemo(() => new Raycaster(), [])

  useFrame(() => {
    const interactableObjects = getInteractableObjects()

    if (interactableObjects.length === 0) {
      setLookingAt(null)
      return
    }

    // Cast ray through the screen center along the camera's forward direction
    raycaster.setFromCamera(NDC_CENTER, camera)

    // intersectObjects with recursive=true hits child meshes within registered groups
    const hits = raycaster.intersectObjects(interactableObjects, true)

    if (hits.length > 0 && hits[0].distance <= INTERACTION_RANGE) {
      const hit = hits[0]

      // The hit object may be a child mesh — walk up to find the registered root
      const found = findInteractableByHit(hit.object)

      if (found) {
        setLookingAt({
          id:       found.id,
          name:     found.meta.name,
          distance: hit.distance,
        })
        return
      }
    }

    // Nothing in range
    setLookingAt(null)
  })
}
