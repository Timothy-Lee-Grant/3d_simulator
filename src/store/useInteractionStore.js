/**
 * useInteractionStore — global interaction state via Zustand.
 *
 * Two concerns:
 *
 * 1. LOOK-AT STATE  (updated every frame by the raycaster in Player.jsx)
 *    The player is continuously scanning the scene with a forward ray.
 *    When that ray hits a registered interactable within reach, `lookingAt`
 *    is set to a descriptor object. When nothing is in range, it's null.
 *    The Overlay reads this to decide whether to show the "Press E" prompt.
 *
 * 2. INTERACTION LOG  (appended when the player presses E)
 *    `lastInteraction` records what was last interacted with and when.
 *    The Overlay shows a brief on-screen message, then the HUD returns to normal.
 *
 * Why Zustand here instead of React state?
 * The raycaster runs inside `useFrame` in Player.jsx (inside the Canvas).
 * The prompt is shown by Overlay.jsx (outside the Canvas, in the DOM).
 * These two components have no parent-child relationship, so lifting state
 * up would require threading it through App.jsx. Zustand lets both components
 * access the same store directly with zero prop drilling.
 */

import { create } from 'zustand'

export const useInteractionStore = create((set) => ({
  // ── Look-at state ─────────────────────────────────────────────────────────
  //
  // Set to null when the player isn't looking at anything interactable,
  // or to an object describing the target when they are.
  //
  // Shape: { id: string, name: string, distance: number } | null
  lookingAt: null,

  setLookingAt: (target) => set({ lookingAt: target }),

  // ── Interaction log ───────────────────────────────────────────────────────
  //
  // Updated when the player presses E while looking at an interactable.
  // Shape: { id: string, name: string, time: number } | null
  lastInteraction: null,

  interact: (target) => set({
    lastInteraction: {
      id:   target.id,
      name: target.name,
      time: Date.now(),
    }
  }),
}))
