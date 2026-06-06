/**
 * useWorldStore — the persistent state of the world, separate from the player.
 *
 * Tracks which things have happened in the world: which NPCs have been spoken
 * to, which items have been collected, which areas have been visited.
 *
 * ── Separation from useGameStore ─────────────────────────────────────────
 *
 * World state is distinct from player state in a meaningful way:
 *
 *   Player state  — what the player IS (health, stamina) and HAS (inventory).
 *                   If a new player starts a fresh game, this resets.
 *
 *   World state   — what has HAPPENED in the world. NPCs remember being met.
 *                   Items that were picked up stay gone. Areas stay discovered.
 *                   This persists even if player stats reset.
 *
 * In a game with multiple saves or permadeath modes, these might reset together —
 * but keeping them structurally separate makes that choice easier.
 *
 * ── Usage in components ──────────────────────────────────────────────────
 *
 * NPC.jsx — read interactedNPCs to show a "met" indicator:
 *   const hasMetNPC = useWorldStore(state => state.interactedNPCs.includes(npcId))
 *
 * Player.jsx — record interactions:
 *   const addInteractedNPC = useWorldStore(state => state.addInteractedNPC)
 *   // when E is pressed: addInteractedNPC(lookingAt.id)
 *
 * Item.jsx (Phase 3.5) — check if already collected:
 *   const collected = useWorldStore(state => state.pickedUpItems.includes(itemId))
 *   if (collected) return null
 */

import { create } from 'zustand'

export const useWorldStore = create((set, get) => ({
  // ── NPC interaction history ───────────────────────────────────────────────
  //
  // Array of npcId strings the player has pressed E on.
  // Used to: show "already met" indicator, gate dialogue branches, track quest progress.
  interactedNPCs: [],

  addInteractedNPC: (npcId) => set(state => ({
    interactedNPCs: state.interactedNPCs.includes(npcId)
      ? state.interactedNPCs
      : [...state.interactedNPCs, npcId]
  })),

  hasInteractedWith: (npcId) => get().interactedNPCs.includes(npcId),

  // ── Discovered areas ──────────────────────────────────────────────────────
  //
  // Area ids that have been visited by the player.
  // Populated by trigger volumes (Phase 4.1 level system).
  // Used for: minimap reveals, quest tracking, "discover X areas" achievements.
  discoveredAreas: [],

  discoverArea: (areaId) => set(state => ({
    discoveredAreas: state.discoveredAreas.includes(areaId)
      ? state.discoveredAreas
      : [...state.discoveredAreas, areaId]
  })),

  // ── Collected items ───────────────────────────────────────────────────────
  //
  // Item ids that have been picked up. Used by Item.jsx (Phase 3.5) to
  // conditionally unmount collected items so they don't respawn.
  pickedUpItems: [],

  pickUpItem: (itemId) => set(state => ({
    pickedUpItems: state.pickedUpItems.includes(itemId)
      ? state.pickedUpItems
      : [...state.pickedUpItems, itemId]
  })),

  isPickedUp: (itemId) => get().pickedUpItems.includes(itemId),
}))
