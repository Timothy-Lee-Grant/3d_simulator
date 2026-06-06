/**
 * useGameStore — player-centric game state.
 *
 * Stores everything that belongs to the player and must persist across
 * components or survive component unmounts: health, stamina, inventory,
 * and last known position (for the save/load system in Phase 7).
 *
 * ── Why two stores? ───────────────────────────────────────────────────────
 *
 * Game state divides cleanly into two concerns:
 *
 *   useGameStore  — the PLAYER: how alive they are, what they're carrying,
 *                   where they've been. Player-specific, save-critical.
 *
 *   useWorldStore — the WORLD: which NPCs have been met, which items have
 *                   been picked up, which areas have been discovered. World-
 *                   specific, also save-critical but separate from player stats.
 *
 * Keeping them separate means components only subscribe to what they care about.
 * The HUD only reads from useGameStore. NPC.jsx only reads from useWorldStore.
 * They never trigger each other's subscribers.
 *
 * ── Performance note on setStamina ───────────────────────────────────────
 *
 * setStamina is called from Player.jsx's useFrame loop — but NOT every frame.
 * Player.jsx keeps a local ref for frame-accurate arithmetic, then syncs to
 * the store at ~20Hz (every 50ms). This limits Overlay re-renders to 20/sec
 * instead of 60/sec while keeping the bar visually smooth.
 *
 * ── Selector pattern ─────────────────────────────────────────────────────
 *
 * Always subscribe to the narrowest slice needed:
 *
 *   const health = useGameStore(state => state.health)       // re-renders on health change only
 *   const stamina = useGameStore(state => state.stamina)     // re-renders on stamina change only
 *
 * Avoid subscribing to the whole store:
 *
 *   const store = useGameStore()   // re-renders on ANY store change — avoid this
 *
 * Actions are stable references (Zustand never recreates them), so subscribing
 * to an action doesn't cause re-renders:
 *
 *   const takeDamage = useGameStore(state => state.takeDamage)  // stable, safe in useFrame
 */

import { create } from 'zustand'

export const useGameStore = create((set, get) => ({
  // ── Health ────────────────────────────────────────────────────────────────
  health:    100,
  maxHealth: 100,

  takeDamage: (amount) => set(state => ({
    health: Math.max(0, state.health - amount)
  })),

  heal: (amount) => set(state => ({
    health: Math.min(state.maxHealth, state.health + amount)
  })),

  // ── Stamina ───────────────────────────────────────────────────────────────
  //
  // Stamina is the resource consumed by sprinting. When it hits 0 the player
  // enters an EXHAUSTED state — sprint is locked out until stamina recovers to
  // EXHAUSTION_RECOVERY_THRESHOLD (25%). This prevents the player from
  // oscillating between "sprint works" / "sprint doesn't work" at the exact
  // boundary, which would feel jittery.
  //
  // Player.jsx owns the drain/regen arithmetic (it runs in useFrame) and
  // passes both the new value and the new exhaustion state here in one call
  // to avoid two separate store writes per sync.
  stamina:    100,
  maxStamina: 100,
  isExhausted: false,

  // value: 0–100 (clamped). exhausted: explicit exhaustion flag from Player.
  setStamina: (value, exhausted) => set(state => ({
    stamina:     Math.max(0, Math.min(state.maxStamina, value)),
    isExhausted: exhausted !== undefined ? exhausted : state.isExhausted,
  })),

  // ── Inventory ─────────────────────────────────────────────────────────────
  //
  // Each item is an object with at least { id, name, description }.
  // Further fields (icon, stats, stackCount) will be added in 3.5.
  inventory:    [],
  equippedItem: null,

  pickUpItem: (item) => set(state => ({
    inventory: [...state.inventory, item]
  })),

  dropItem: (itemId) => set(state => ({
    inventory:    state.inventory.filter(i => i.id !== itemId),
    equippedItem: state.equippedItem?.id === itemId ? null : state.equippedItem,
  })),

  equipItem: (itemId) => set(state => ({
    equippedItem: state.inventory.find(i => i.id === itemId) || null
  })),

  unequip: () => set({ equippedItem: null }),

  // ── Position ──────────────────────────────────────────────────────────────
  //
  // Updated by Player.jsx every ~2 seconds for save/load (Phase 7).
  // Not the live camera position — that lives in Three.js and is read via
  // camera.position directly. This is the persisted "last known position."
  position: { x: 0, y: 1.7, z: 0 },

  savePosition: (pos) => set({ position: pos }),

  // ── Derived helpers ───────────────────────────────────────────────────────
  //
  // These are functions on the store (not state), so they don't cause
  // re-renders when called — they just compute a value from current state.
  //
  // Usage:  useGameStore.getState().healthPercent()
  //         (or in a selector: state => state.healthPercent())
  healthPercent:  () => get().health  / get().maxHealth,
  staminaPercent: () => get().stamina / get().maxStamina,
}))
