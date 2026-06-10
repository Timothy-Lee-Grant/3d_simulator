/**
 * useDebugStore — Phase 7.4: runtime-tunable development values.
 *
 * A Zustand store that holds every value the DebugPanel can modify.
 * Components that want to be tunable import from this store instead of
 * using hardcoded constants.
 *
 * ── Dev-only pattern ──────────────────────────────────────────────────────────
 *
 * Because these values only matter during development, components can guard
 * the debug store subscription with import.meta.env.DEV:
 *
 *   const walkSpeed = import.meta.env.DEV
 *     ? useDebugStore(s => s.walkSpeed)
 *     : WALK_SPEED  // const from the file
 *
 * In production (npm run build), Vite replaces import.meta.env.DEV with false.
 * The dead-code eliminator removes the entire Zustand subscription — zero cost.
 *
 * ── Leva (reference) ─────────────────────────────────────────────────────────
 *
 * Leva (https://github.com/pmndrs/leva) is the standard debug panel for R3F
 * projects. It generates a floating UI from a config object:
 *
 *   import { useControls } from 'leva'
 *   const { walkSpeed, fogDensity } = useControls({
 *     walkSpeed: { value: 7, min: 1, max: 20, step: 0.5 },
 *     fogDensity: { value: 0.015, min: 0, max: 0.1, step: 0.001 },
 *   })
 *
 * No store, no panel component needed — Leva creates the UI automatically.
 * Install with: npm install leva
 * The custom DebugPanel below provides the same functionality without the dep.
 */

import { create } from 'zustand'

export const useDebugStore = create(set => ({
  // ── Player ──────────────────────────────────────────────────────────────────
  walkSpeed:   7.0,
  sprintSpeed: 14.0,

  // ── Environment ─────────────────────────────────────────────────────────────
  fogDensity:   0.015,
  cycleSpeed:   0.002,   // day/night cycle speed multiplier
  grassVisible: true,    // toggle GrassField on/off

  // ── Debug overlays ──────────────────────────────────────────────────────────
  showColliders: false,  // draw AABB wireframes for collision boxes
  showLODMarkers: false, // show LOD distance rings

  // ── Post-processing ──────────────────────────────────────────────────────────
  ppEnabled: true,

  // ── Actions ────────────────────────────────────────────────────────────────
  set: (key, value) => set({ [key]: value }),
  reset: () => set({
    walkSpeed: 7.0, sprintSpeed: 14.0, fogDensity: 0.015,
    cycleSpeed: 0.002, grassVisible: true,
    showColliders: false, showLODMarkers: false, ppEnabled: true,
  }),
}))
