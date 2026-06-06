/**
 * useInteractionStore — global interaction and dialogue state.
 *
 * Three concerns:
 *
 * 1. LOOK-AT STATE  (updated every frame by useRaycast.js)
 *    When the player's crosshair ray hits a registered interactable within
 *    interaction range, `lookingAt` describes the target. Null when nothing
 *    is in range. The Overlay reads this to show the "Press E" prompt.
 *
 * 2. INTERACTION LOG  (appended when the player presses E)
 *    `lastInteraction` records the most recent E press. Used for non-dialogue
 *    interactables (future: doors, levers, items). For NPC interaction the
 *    dialogue system takes over instead.
 *
 * 3. DIALOGUE STATE  (3.4 — NPC dialogue system)
 *    `activeDialogue` tracks the current open conversation: which NPC and which
 *    node in their tree the player is on. null when no dialogue is open.
 *
 *    Flow:
 *      Player presses E on NPC
 *        → openDialogue(npcId, nodeKey)  [Player.jsx]
 *        → document.exitPointerLock()   [Player.jsx — frees mouse for clicking]
 *      Player clicks a response
 *        → advanceDialogue(next)         [Overlay.jsx DialoguePanel]
 *        → if next === null: dialogue closes, requestLock() re-locks pointer
 *
 *    The Overlay's start screen is hidden while activeDialogue is not null,
 *    so the dialogue panel renders on top of the HUD without the start screen
 *    appearing (even though pointer lock was released).
 */

import { create } from 'zustand'

export const useInteractionStore = create((set) => ({

  // ── Look-at state ─────────────────────────────────────────────────────────
  //
  // Shape: { id: string, name: string, distance: number } | null
  lookingAt: null,
  setLookingAt: (target) => set({ lookingAt: target }),

  // ── Interaction log ───────────────────────────────────────────────────────
  //
  // Shape: { id: string, name: string, time: number } | null
  lastInteraction: null,
  interact: (target) => set({
    lastInteraction: { id: target.id, name: target.name, time: Date.now() },
  }),

  // ── Dialogue state ────────────────────────────────────────────────────────
  //
  // Shape: { npcId: string, nodeKey: string } | null
  //
  // `npcId`   — key into DIALOGUE (e.g. 'npc_01')
  // `nodeKey` — key within that NPC's tree (e.g. 'greeting', 'identity')
  activeDialogue: null,

  /**
   * Open dialogue for the given NPC, starting at the specified node.
   * @param {string} npcId
   * @param {string} [nodeKey='greeting']  Usually 'greeting' or 'return_greeting'
   */
  openDialogue: (npcId, nodeKey = 'greeting') =>
    set({ activeDialogue: { npcId, nodeKey } }),

  /**
   * Navigate to the next dialogue node, or close dialogue if next is null.
   * @param {string|null} nextKey
   */
  advanceDialogue: (nextKey) =>
    set(state => ({
      activeDialogue: nextKey
        ? { ...state.activeDialogue, nodeKey: nextKey }
        : null,
    })),

  /** Force-close dialogue (e.g. on ESC). */
  closeDialogue: () => set({ activeDialogue: null }),
}))
