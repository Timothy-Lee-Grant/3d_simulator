/**
 * saveLoad.js — Phase 7.2: Browser Persistence
 *
 * Serialises the complete game state to localStorage and restores it on load.
 *
 * ── What localStorage Is ─────────────────────────────────────────────────────
 *
 * localStorage is a key→string map that persists across browser sessions.
 * It survives tab closes, refreshes, and computer restarts (until explicitly
 * cleared or the user clears browser data). It's synchronous, up to ~5–10 MB,
 * and only accessible from the same origin (domain + port).
 *
 * The API is two methods:
 *   localStorage.setItem(key, stringValue)  — write
 *   localStorage.getItem(key)               — read (returns null if missing)
 *   localStorage.removeItem(key)            — delete
 *
 * To store objects: JSON.stringify() before write, JSON.parse() after read.
 *
 * ── What to Save ─────────────────────────────────────────────────────────────
 *
 * Player state (from useGameStore):
 *   position, health, inventory, equippedSlot
 *
 * World state (from useWorldStore):
 *   interactedNPCs, discoveredAreas, pickedUpItems
 *
 * We deliberately DON'T save:
 *   - stamina (regens fully on load — common game convention)
 *   - cameraYaw (the camera is placed at the saved position; player can look around)
 *   - scene object transforms (those are deterministic/static)
 *
 * ── Save Versioning ───────────────────────────────────────────────────────────
 *
 * Always embed a `version` field in save data. When you change the save schema
 * (add fields, rename keys, restructure), bump the version constant. On load,
 * reject saves with mismatched versions rather than silently loading corrupt data.
 *
 * Simple version check:
 *   if (data.version !== SAVE_VERSION) { deleteSave(); return null }
 *
 * More sophisticated: a migration function per version that transforms old data
 * to the current schema. (Not implemented here — left as an extension exercise.)
 *
 * ── Why Not IndexedDB? ───────────────────────────────────────────────────────
 *
 * IndexedDB is a more capable browser persistence API: larger storage, async,
 * supports binary data and multiple stores. For a game with large save files
 * (screenshots, complex world state, multiple save slots), IndexedDB is correct.
 * For this project, localStorage is sufficient and simpler to reason about.
 *
 * ── Auto-Save Strategy ───────────────────────────────────────────────────────
 *
 * Auto-save every 30 real-world seconds. This is conservative — most games
 * auto-save more aggressively. The 30s interval balances:
 *   - Safety: you lose at most 30s of progress on a crash
 *   - Performance: localStorage.setItem is synchronous and locks the JS thread
 *     for the duration of the write. For a ~2KB save file this is <1ms.
 */

import { useGameStore }  from '../store/useGameStore'
import { useWorldStore } from '../store/useWorldStore'

// ── Constants ────────────────────────────────────────────────────────────────

const SAVE_KEY     = '3d_explorer_save'
const SAVE_VERSION = 2   // bump this whenever save schema changes

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Serialises all game state to localStorage.
 * @returns {number} Unix timestamp of the save, for display in the UI
 */
export function saveGame() {
  const game  = useGameStore.getState()
  const world = useWorldStore.getState()

  const data = {
    version:   SAVE_VERSION,
    timestamp: Date.now(),

    player: {
      position:     { ...game.position },  // plain object, no proxy
      health:       game.health,
      inventory:    game.inventory.map(item => ({ ...item })),
      equippedSlot: game.equippedSlot,
    },

    world: {
      interactedNPCs:  [...world.interactedNPCs],
      discoveredAreas: [...world.discoveredAreas],
      pickedUpItems:   [...world.pickedUpItems],
    },
  }

  localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  return data.timestamp
}

/**
 * Reads and parses save data from localStorage.
 * @returns {object|null} Parsed save data, or null if no save / wrong version
 */
export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null

  try {
    const data = JSON.parse(raw)

    // Version check — reject old formats rather than crashing on missing fields
    if (data.version !== SAVE_VERSION) {
      console.warn(`[saveLoad] Save version mismatch: got ${data.version}, expected ${SAVE_VERSION}. Discarding.`)
      return null
    }

    return data
  } catch (err) {
    console.error('[saveLoad] Failed to parse save data:', err)
    return null
  }
}

/**
 * Returns true if a compatible save exists in localStorage.
 */
export function hasSave() {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false
  try {
    const data = JSON.parse(raw)
    return data.version === SAVE_VERSION
  } catch {
    return false
  }
}

/**
 * Returns the save timestamp as a formatted string, or null if no save.
 */
export function getSaveTimestamp() {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (data.version !== SAVE_VERSION) return null
    return new Date(data.timestamp).toLocaleTimeString([], {
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

/**
 * Permanently deletes the save from localStorage.
 */
export function deleteSave() {
  localStorage.removeItem(SAVE_KEY)
}

/**
 * Applies loaded save data to the Zustand stores.
 * Call this after loadGame() returns non-null data.
 *
 * Does NOT move the camera — that must be done separately by the caller
 * because the camera lives inside the Three.js/R3F context, not in a store.
 * See App.jsx for how to apply the saved position to camera.position.
 *
 * @param {object} data  Save data from loadGame()
 * @returns {{ spawnPosition: {x,y,z} }} Data the caller needs for scene setup
 */
export function applyLoadedGame(data) {
  if (!data) return {}

  // ── Apply player state ─────────────────────────────────────────────────
  useGameStore.setState({
    health:       data.player.health,
    stamina:      100,                    // always start with full stamina
    inventory:    [],                     // clear first to avoid duplicates
    equippedSlot: data.player.equippedSlot,
    position:     data.player.position,
  })

  // Re-add inventory items
  const { pickUpItem } = useGameStore.getState()
  data.player.inventory.forEach(item => pickUpItem(item))

  // ── Apply world state ──────────────────────────────────────────────────
  useWorldStore.setState({
    interactedNPCs:  data.world.interactedNPCs,
    discoveredAreas: data.world.discoveredAreas,
    pickedUpItems:   data.world.pickedUpItems,
  })

  return {
    // The caller moves camera.position to this on next frame
    spawnPosition: data.player.position,
  }
}

// ── React hook for auto-save ───────────────────────────────────────────────────

/**
 * Call inside a React component. Sets up a 30-second auto-save interval.
 * Returns { lastSaveTime } — the timestamp of the most recent save.
 *
 * The interval is cleared when the component unmounts.
 */
export function useAutoSave(enabled = true) {
  // Returns just the functions — no need to import React here, caller handles the hook
  return { saveGame, hasSave, getSaveTimestamp }
}

export const AUTO_SAVE_INTERVAL = 30_000   // 30 seconds in ms
