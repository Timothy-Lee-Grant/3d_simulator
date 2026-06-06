/**
 * useGameStore — player-centric game state.
 *
 * Stores everything that belongs to the player and must persist across
 * components or survive component unmounts: health, stamina, inventory,
 * camera bearing (for the compass), and last known position.
 *
 * ── Why two stores? ───────────────────────────────────────────────────────
 *
 *   useGameStore  — the PLAYER: stats, inventory, camera orientation.
 *   useWorldStore — the WORLD: which NPCs have been met, which items collected.
 *
 * Keeping them separate means components only subscribe to what they care about.
 * The HUD reads from useGameStore. NPC.jsx reads from useWorldStore. They never
 * trigger each other's subscribers.
 *
 * ── Inventory slot system ─────────────────────────────────────────────────
 *
 * The quick bar has 5 slots (index 0–4). `equippedSlot` tracks which is active.
 * The equipped item is always `inventory[equippedSlot]` — computed in components,
 * not stored separately. This avoids the synchronisation problem of keeping a
 * `equippedItem` field in sync with both the inventory array and the slot index.
 *
 * ── Camera yaw + compass ──────────────────────────────────────────────────
 *
 * `cameraYaw` stores camera.rotation.y, synced from a CameraSync component
 * inside Canvas at ~20Hz. The Overlay compass reads it to compute bearing.
 * 20Hz is fast enough for a compass — the update latency is imperceptible.
 *
 * ── Performance: setStamina and setCameraYaw ──────────────────────────────
 *
 * Both are called from useFrame-based loops at throttled rates (~20Hz).
 * Player.jsx calls setStamina every 50ms. CameraSync calls setCameraYaw
 * every 50ms. The Overlay re-renders at most 20×/sec from each, but since
 * they're offset they trigger at different times — not simultaneously.
 *
 * ── Selector pattern ─────────────────────────────────────────────────────
 *
 * Always subscribe to the narrowest slice:
 *   const health = useGameStore(state => state.health)     // ✓ surgical
 *   const store  = useGameStore()                          // ✗ re-renders on any change
 *
 * Actions are stable references and never cause re-renders:
 *   const equipSlot = useGameStore(state => state.equipSlot)  // ✓ stable
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
  // Player.jsx owns the drain/regen arithmetic in useFrame. It passes both
  // the new value and the new exhaustion flag in one call to avoid two writes.
  //
  // isExhausted: sprint is locked out when true. Cleared when stamina recovers
  // to 25+ (the hysteresis gap prevents jittery sprint-toggle at 0).
  stamina:     100,
  maxStamina:  100,
  isExhausted: false,

  setStamina: (value, exhausted) => set(state => ({
    stamina:     Math.max(0, Math.min(state.maxStamina, value)),
    isExhausted: exhausted !== undefined ? exhausted : state.isExhausted,
  })),

  // ── Camera yaw (for compass) ──────────────────────────────────────────────
  //
  // camera.rotation.y, pushed here by CameraSync (App.jsx) at ~20Hz.
  // 0 = facing -Z (North). Increases turning left (West). Decreases turning right (East).
  cameraYaw: 0,
  setCameraYaw: (yaw) => set({ cameraYaw: yaw }),

  // ── Inventory ─────────────────────────────────────────────────────────────
  //
  // Each item: { id, name, color, description }
  // `color` is used by the quick bar as the item's icon tint until Phase 6 brings real models.
  inventory: [],

  pickUpItem: (item) => set(state => ({
    inventory: state.inventory.find(i => i.id === item.id)
      ? state.inventory          // don't duplicate
      : [...state.inventory, item]
  })),

  dropItem: (itemId) => set(state => ({
    inventory: state.inventory.filter(i => i.id !== itemId),
  })),

  // ── Item use ──────────────────────────────────────────────────────────────
  //
  // Returns a result string describing what happened, so the HUD can display
  // feedback. Consumable items (type: 'consumable') are removed after use.
  // Quest/tool items show a description instead.
  //
  // Item types:
  //   'consumable' — used up on F press (e.g. Healing Herb)
  //   'key'        — quest item, inspectable only
  //   'tool'       — inspectable, kept after use
  useItem: () => {
    const state = get()
    const item  = state.inventory[state.equippedSlot]
    if (!item) return null

    if (item.type === 'consumable') {
      const healed = Math.min(item.healAmount ?? 30, state.maxHealth - state.health)
      if (healed <= 0) return { text: 'Already at full health.', consumed: false }
      set(s => ({
        health:    Math.min(s.maxHealth, s.health + (item.healAmount ?? 30)),
        inventory: s.inventory.filter(i => i.id !== item.id),
      }))
      return { text: `Used ${item.name}. +${healed} HP`, consumed: true }
    }

    // Non-consumable: just show the description
    return { text: item.description, consumed: false }
  },

  // ── Quick bar slot selection ──────────────────────────────────────────────
  //
  // Slots 0–4 (displayed as 1–5 in the HUD).
  // The equipped item is inventory[equippedSlot] — not stored separately.
  equippedSlot: 0,

  equipSlot: (index) => set({
    equippedSlot: Math.max(0, Math.min(4, index))
  }),

  // ── Position snapshot ─────────────────────────────────────────────────────
  //
  // camera.position serialised to plain { x, y, z } every 2 seconds.
  // Used by the save/load system (Phase 7) — not live camera state.
  position: { x: 0, y: 1.7, z: 0 },

  savePosition: (pos) => set({ position: pos }),

  // ── Derived helpers ───────────────────────────────────────────────────────
  healthPercent:  () => get().health  / get().maxHealth,
  staminaPercent: () => get().stamina / get().maxStamina,
  equippedItem:   () => get().inventory[get().equippedSlot] ?? null,
}))
