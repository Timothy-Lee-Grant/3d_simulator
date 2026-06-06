# Game State Management with Zustand

> How the project stores, updates, and subscribes to game state — covering why Zustand over React state, the two-store architecture, the ref-vs-store performance split, and the stamina state machine.

---

## Why Not useState?

React's `useState` ties state to a component. When that component unmounts, the state is gone. When you need the same value in two components that aren't parent/child, you have to lift state up — threading it through a common ancestor via props.

In a game, state crosses many component boundaries that have no natural parent/child relationship:

| State | Written by | Read by |
|---|---|---|
| `stamina` | `Player.jsx` (inside Canvas) | `Overlay.jsx` (outside Canvas) |
| `interactedNPCs` | `Player.jsx` | `NPC.jsx` (different part of Canvas) |
| `health` | future damage sources anywhere | `Overlay.jsx` + save system |
| `inventory` | `Item.jsx` | `Overlay.jsx` + `Player.jsx` |

Threading all of this through `App.jsx` via props would make `App.jsx` enormous and couple every component together. Worse, any component re-render in the middle of the chain would trigger unnecessary re-renders in all consumers.

**Zustand** solves this with a store that lives outside the component tree entirely. Any component can read from or write to it at any time, with no Provider wrapping, no prop drilling, and surgical re-renders (only components that subscribe to the changed slice re-render).

---

## Creating a Store

```javascript
import { create } from 'zustand'

export const useGameStore = create((set, get) => ({
  health: 100,
  maxHealth: 100,

  takeDamage: (amount) => set(state => ({
    health: Math.max(0, state.health - amount)
  })),
}))
```

`create` takes a factory function that receives `set` and `get`:
- `set(updater)` — merges the returned object into the store state. If you pass a function, it receives the current state as an argument (important for derived updates like `Math.max(0, state.health - amount)`).
- `get()` — reads the current state without subscribing. Used inside actions that need to compute based on other state values. Calling `get()` inside a component would not subscribe that component to changes.

The store is a plain JavaScript object with data and functions mixed together. The functions are **actions** — they call `set` to update the store.

---

## The Two-Store Architecture

The project uses two Zustand stores with different concerns:

### `useGameStore` — the player

Owns everything that belongs to the player: health, stamina, inventory, last known position. This is the state you'd save in a "player profile" slot.

```javascript
{ health, maxHealth, stamina, maxStamina, isExhausted,
  inventory, equippedItem, position }
```

### `useWorldStore` — the world

Owns everything that happened to the world: which NPCs have been spoken to, which items have been collected, which areas have been visited. This is the state you'd save in a "world save file."

```javascript
{ interactedNPCs, discoveredAreas, pickedUpItems }
```

Keeping them separate means:
- A component that only cares about NPC interaction history doesn't re-render when the player's health changes
- In a future multi-save system, you could load a different world state onto the same player, or vice versa

---

## Subscriptions and Selectors

A **selector** is the function you pass to `useGameStore`:

```javascript
// Subscribes to health only — re-renders when health changes
const health = useGameStore(state => state.health)

// Subscribes to stamina only — independent subscription
const stamina = useGameStore(state => state.stamina)

// AVOID: subscribes to the whole store — re-renders on ANY change
const store = useGameStore()
```

Each `useGameStore(selector)` call creates an independent subscription. If health and stamina are in the same component but subscribed separately, changing stamina triggers a re-render of that component but not of a different component that only subscribes to health.

**Actions are stable:** Zustand creates action functions once and never recreates them. Subscribing to an action doesn't cause re-renders even when other state changes:

```javascript
// This selector never changes, so this component never re-renders from store changes
const takeDamage = useGameStore(state => state.takeDamage)
```

This is safe to call inside `useFrame` (inside the Canvas render loop) without causing performance issues.

---

## The Ref-vs-Store Performance Split

The stamina system exposes a fundamental tension in React game development:

- **Three.js render loop** runs at 60fps via `useFrame`. It needs stamina to be accurate every frame.
- **React render loop** triggers DOM updates. Re-rendering the Overlay 60 times per second is wasteful for a bar that's visually smooth at 20fps.

The solution is a two-tier system:

### Tier 1: Ref (per-frame accuracy)

```javascript
const staminaRef     = useRef(100)   // frame-accurate value
const isExhaustedRef = useRef(false) // derived flag

// In useFrame:
staminaRef.current -= STAMINA_DRAIN_RATE * delta   // exact arithmetic every frame
```

`useRef` stores a mutable box with `.current`. Mutations don't trigger re-renders — the value updates silently at 60fps.

### Tier 2: Store (display updates)

```javascript
const staminaSyncAccum = useRef(0)

// In useFrame:
staminaSyncAccum.current += delta
if (staminaSyncAccum.current >= 0.05) {      // every 50ms = 20Hz
  setStamina(staminaRef.current, isExhaustedRef.current)
  staminaSyncAccum.current = 0
}
```

Every 50ms, the ref value is pushed into the store. Overlay re-renders 20 times per second — smooth enough for a bar animation.

The accumulator pattern is the standard game-dev approach for throttled updates: add `delta` each frame, fire the action when it exceeds the threshold, then reset to zero (not to zero — reset the overflow so timing stays consistent).

### Why not useEffect for syncing?

`useEffect` runs after renders, not in the render loop. It can't reliably run at a fixed Hz. The accumulator in `useFrame` runs in the Three.js loop at exactly the right time, every frame, with the correct delta.

---

## The Stamina State Machine

Stamina is more than a number that decreases. It has a **state** that affects sprint behavior:

```
NORMAL: stamina > 0, sprint works
  → drain while sprinting + moving: stamina -= 25 * delta
  → regen while not sprinting:      stamina += 15 * delta
  → if stamina hits 0: enter EXHAUSTED

EXHAUSTED: sprint is locked out
  → always regen:  stamina += 15 * delta
  → sprint key has no effect
  → if stamina >= 25: return to NORMAL
```

The state machine has two transitions:
- **Enter exhaustion:** `stamina <= 0`
- **Clear exhaustion:** `stamina >= 25` (the recovery threshold)

The gap between 0 and 25 is intentional. Without it, the player at exactly 0 stamina would oscillate:
- Frame 1: stamina = 0 → exhausted = true → sprint off → regen by 0.25 → stamina = 0.25
- Frame 2: stamina = 0.25 > 0 → exhausted = false → sprint on → drain by 0.42 → stamina < 0 → clamp to 0
- Frame 3: repeat every frame

The 25-unit hysteresis gap means the player must run for ~1.6 seconds before sprint re-enables — a deliberate design that makes exhaustion a meaningful setback rather than a momentary blip.

In code:

```javascript
// Enter exhaustion
if (staminaRef.current <= 0) {
  isExhaustedRef.current = true
}
// Clear exhaustion (only when stamina has recovered enough)
if (isExhaustedRef.current && staminaRef.current >= EXHAUSTION_RECOVERY_THRESHOLD) {
  isExhaustedRef.current = false
}
```

The sprint decision then uses the exhaustion flag:

```javascript
const sprintActive = sprintPressed && moving && !isExhaustedRef.current
```

---

## Reading getState() Without Subscribing

Sometimes you need a store value inside a function that runs outside the render cycle — an event handler, a `useFrame` callback, or a utility function. You can't call a hook there, but you can call `getState()`:

```javascript
// Read current stamina without subscribing (no re-render):
const currentStamina = useGameStore.getState().stamina

// Useful in useFrame to avoid subscribing Player.jsx to health changes:
const currentHealth = useGameStore.getState().health
```

`getState()` is a static method on the store hook. It returns the current state snapshot without creating a subscription. This is how Player.jsx reads the initial stamina value:

```javascript
const staminaRef = useRef(useGameStore.getState().stamina)  // initialize from store
```

If the player loaded a saved game with 60 stamina, this ensures `staminaRef` starts at 60 instead of 100.

---

## World Store: Idempotent Actions

The world store's `addInteractedNPC`, `discoverArea`, and `pickUpItem` are all **idempotent** — calling them multiple times with the same argument produces the same result as calling them once:

```javascript
addInteractedNPC: (npcId) => set(state => ({
  interactedNPCs: state.interactedNPCs.includes(npcId)
    ? state.interactedNPCs          // already in list — no change
    : [...state.interactedNPCs, npcId]  // add it
}))
```

This is important because interactions are triggered by the player and may fire multiple times in edge cases (fast keypress, network retry, hot reload). Idempotent actions are safe to call repeatedly without corrupting state. The array grows at most by one entry per unique npcId.

---

## Position Snapshots

Three.js's `camera.position` is a `Vector3` — a mutable object with `x`, `y`, `z` properties. It exists entirely outside React and Zustand.

For save/load (Phase 7), we need the player's position as plain serializable data. `Player.jsx` snapshots it into the store every 2 seconds:

```javascript
savePosition({
  x: camera.position.x,
  y: camera.position.y,
  z: camera.position.z,
})
```

Every 2 seconds is frequent enough that a save always reflects a recent position (within 2 seconds of the player's true position), but infrequent enough that it's negligible overhead. The store only re-renders subscribers when the value changes — since it changes every 2 seconds, any position display in the UI (future minimap, debug overlay) would update at 0.5Hz.

---

## What Comes Next

The store infrastructure is the prerequisite for all future game mechanics:

**3.3 HUD expansion** — the stamina bar and health bar are already built. Next: inventory quick bar (read `inventory` from `useGameStore`), compass (read camera rotation from `useThree()`), stamina regeneration visual cue.

**3.4 NPC dialogue** — a `dialogueState` slice added to `useInteractionStore` or a new `useDialogueStore`. NPC.jsx reads `interactedNPCs` from `useWorldStore` to show different greetings to NPCs already met.

**3.5 Collectible items** — `Item.jsx` reads `pickedUpItems` from `useWorldStore` to conditionally unmount already-collected items. `pickUpItem` in `useGameStore` adds the item to `inventory`.

**7.2 Save/Load** — `useGameStore.getState()` and `useWorldStore.getState()` serialize to JSON for `localStorage`. `set(savedState)` hydrates both stores on load.

---

## Files Created or Modified

| File | What changed |
|---|---|
| `src/store/useGameStore.js` | **New.** Player state: health, stamina (with exhaustion), inventory, position, all actions |
| `src/store/useWorldStore.js` | **New.** World state: interactedNPCs, discoveredAreas, pickedUpItems, all actions |
| `src/components/Player.jsx` | **Modified.** Stamina drain/regen/exhaustion system; position snapshot; `addInteractedNPC` on E press; store sync at 20Hz via accumulator |
| `src/components/Overlay.jsx` | **Modified.** Health bar + stamina bar in top-left HUD; exhaustion indicator; NPC met counter; imports for `useGameStore` and `useWorldStore` |
