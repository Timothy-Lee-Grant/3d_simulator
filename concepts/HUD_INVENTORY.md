# HUD: Health Bar, Stamina Bar, Inventory

> How the DOM overlay is structured as a full game HUD — covering the compass bearing calculation, the inventory slot system, CSS transition-based bar animation, and the data flow from the 3D scene into the 2D overlay.

---

## The Overlay Architecture: 3D Data → 2D DOM

The HUD has a fundamental challenge: it's a DOM element rendered outside the Canvas, but it needs to display data that originates inside the Canvas (the camera's yaw angle) and from stores that game logic inside the Canvas writes to (health, stamina, inventory).

The solution is the same pattern used throughout this project: **Zustand as the bridge**. Components inside the Canvas write to the store; the Overlay reads from the store. No prop passing across the Canvas boundary required.

```
┌─ Canvas ──────────────────────────────────────────────────────┐
│  CameraSync  →  useGameStore.setCameraYaw  (at 20Hz)          │
│  Player.jsx  →  useGameStore.setStamina    (at 20Hz)          │
│  Player.jsx  →  useGameStore.savePosition  (at 0.5Hz)         │
│  Player.jsx  →  useWorldStore.addNPC       (on E press)       │
└───────────────────────────────────────────────────────────────┘
         ↓ Zustand store (lives outside both)
┌─ DOM Overlay ─────────────────────────────────────────────────┐
│  Compass      reads cameraYaw                                 │
│  StatBars     reads health, stamina, isExhausted              │
│  InventoryBar reads inventory, equippedSlot                   │
└───────────────────────────────────────────────────────────────┘
```

---

## The Compass

### Bearing math

Three.js uses a right-hand coordinate system where the camera faces **-Z** by default. PointerLockControls rotates around the Y axis:

- Mouse right (clockwise from above) → **yaw decreases** → camera faces toward **+X** → we call this **East**
- Mouse left (counter-clockwise from above) → **yaw increases** → camera faces toward **-X** → we call this **West**

The compass bearing formula converts yaw (radians, −π to +π) to a clockwise-from-North bearing (degrees, 0–360):

```javascript
const bearing = ((-yaw * 180 / Math.PI) % 360 + 360) % 360
```

Breaking it down:
- `-yaw` — flip the sign because Three.js yaw and compass bearing rotate in opposite directions
- `* 180 / Math.PI` — radians to degrees
- `% 360` — clamp to one full rotation (handles values outside 0–360 from floating-point arithmetic)
- `+ 360) % 360` — ensure the result is always positive (JavaScript's `%` can return negative values)

Result: `0° = North (-Z), 90° = East (+X), 180° = South (+Z), 270° = West (-X)`.

### Scrolling marker strip

Rather than building a full circular compass, the HUD uses a **linear scrolling strip** approach: a 200px window showing 90° of the compass at a time (like a horizontal film strip), with markers positioned based on their angular distance from the current bearing.

For each marker at angle `markerAngle`:

```javascript
let diff = markerAngle - bearing
if (diff >  180) diff -= 360
if (diff < -180) diff += 360
// diff is now in -180..+180 range
// positive = marker is to the right of current facing
// negative = marker is to the left

const x = HALF_WIDTH + diff * (COMPASS_WIDTH / COMPASS_FOV)
```

The normalization step (`diff > 180 → diff -= 360`) handles the wrap-around: when the player faces East (90°) and looks at the North marker (0°), the naive difference is 0−90 = −90, which is correct. But for the West marker (270°), the naive difference is 270−90 = 180, not −180 — the marker would appear to the right even though West is behind the player. The normalization ensures the West marker appears off the left edge of the compass instead.

Markers outside the visible range are not rendered at all (the check `x < -cullPad || x > COMPASS_WIDTH + cullPad` filters them).

### CameraSync: the canvas bridge

The Overlay needs `camera.rotation.y`, but `useThree()` only works inside the Canvas context. The bridge pattern:

```jsx
// Inside Canvas — null-rendering, just syncs data to store
function CameraSync() {
  const { camera }   = useThree()
  const setCameraYaw = useGameStore(state => state.setCameraYaw)
  const accumRef     = useRef(0)

  useFrame((_, delta) => {
    accumRef.current += delta
    if (accumRef.current >= 0.05) {     // 20Hz
      setCameraYaw(camera.rotation.y)
      accumRef.current = 0
    }
  })
  return null
}
```

The accumulator throttles the store write to 20Hz. This is enough for a compass — at 20 updates/sec, the maximum visual lag is 50ms. The transition CSS on the compass markers could smooth this further if needed.

---

## CSS Transitions on Bars

The health and stamina bars change width by modifying an inline `style` object when React re-renders the component. Without a transition, the bar would jump instantly to the new width every 50ms. With one, it animates smoothly:

```css
transition: width 0.12s linear, background 0.3s ease
```

This is set on the fill element:

```jsx
<div style={{
  ...sb.fill,
  width:      `${hpPct}%`,
  background: hpColor,
}} />
```

When React updates this element with a new `width` (at ~20Hz from the stamina store sync), the browser's CSS engine animates from the previous value to the new one over 120ms. Since updates arrive every 50ms, the next update arrives before the current transition finishes — the bar smoothly tracks the value with a slight lag, which actually looks better than instant jumps.

**Color transition on health:** `background 0.3s ease` means the bar gradually shifts from green to orange to red as health falls, rather than snapping between colors.

The glass sheen overlay (a subtle gradient that makes bars look slightly 3D) is a pseudo-element effect achieved with an absolutely positioned div over the fill:

```jsx
<div style={{
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 60%)',
}} />
```

This requires `position: relative` on the track and `overflow: hidden` — which also clips the fill div.

---

## The Inventory Slot System

### Slots vs equippedItem

Earlier versions of the store had `equippedItem: null` as its own state field, requiring a separate `equipItem(id)` action to keep it in sync with the inventory array. This creates a data synchronisation hazard: if an item is dropped while it's equipped, you need to remember to also set `equippedItem` to null.

The slot system eliminates this. The equipped item is always computed from the slot index:

```javascript
// In store:
equippedSlot: 0,
equipSlot: (i) => set({ equippedSlot: Math.max(0, Math.min(4, i)) }),

// In component:
const item = inventory[equippedSlot]  // undefined if slot is empty
```

There's only one piece of state to maintain. Dropping an item just removes it from the array — the equipped item automatically becomes `undefined` (empty slot) without any extra logic.

### Hotkeys vs onClick

Number key input (1-5 to select slots) is handled with a `keydown` event listener in a `useEffect`, not inside `useFrame`:

```javascript
useEffect(() => {
  const onKeyDown = (e) => {
    if (!isLocked.current) return    // guard: only when pointer-locked
    const slot = parseInt(e.key, 10) - 1
    if (slot >= 0 && slot < SLOT_COUNT) equipSlot(slot)
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [equipSlot])
```

**Why not useFrame?** `useFrame` runs every render frame (60fps). For a continuous action like sprinting, you check the key state every frame. For a discrete one-shot action like "switch to slot 3", you want it to fire exactly once per key press — a keydown event handler is the correct tool. You'd need an edge-detection ref in useFrame to get equivalent behavior, which is more code for no benefit.

**Why the isLocked guard?** When the pointer is unlocked (start screen, paused, dialogue), number keys should behave normally in the browser (accessible shortcuts, browser navigation, etc.). The guard ensures hotkeys only override default behavior when the player is actively in the game.

### InventoryBar visual design

Each slot is a square `div` with a `1.5px solid` border. The active slot's border color, background, and box-shadow are all adjusted in a single style object:

```jsx
style={{
  borderColor: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
  background:  isActive ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.52)',
  boxShadow:   isActive ? '0 0 0 1px rgba(...), 0 0 12px rgba(...)' : 'none',
}}
```

The `transition` on the slot (`border-color 0.1s ease, background 0.1s ease, box-shadow 0.1s ease`) makes switching slots feel snappy without being jarring.

Item icons are colored squares (`.iconSwatch` with `background: item.color`). This is a placeholder approach: once Phase 6 adds GLTF model loading, these can be replaced with rendered thumbnails or sprite sheets. The color is set when the item is created, making each item visually distinct even without real assets.

The item name is truncated to the first word (`item.name.split(' ')[0]`) because slot cells are only 54px wide. "Ancient Key" becomes "Ancient". This is readable and fits within the slot.

---

## Starter Items

Three items are seeded into the inventory from `App.jsx` on mount:

```javascript
useEffect(() => {
  const { pickUpItem } = useGameStore.getState()
  pickUpItem({ id: 'item_key',  name: 'Ancient Key',  color: '#f59e0b', ... })
  pickUpItem({ id: 'item_map',  name: 'Old Map',      color: '#84cc16', ... })
  pickUpItem({ id: 'item_herb', name: 'Healing Herb', color: '#22c55e', ... })
}, [])
```

`useGameStore.getState()` reads current store state without creating a subscription — the `useEffect` fires once, adds the items, and never re-runs. This is correct for initialization: you don't want items re-added every render.

The `pickUpItem` action is idempotent by id — it checks if the item already exists before adding it. This makes it safe to call even if the component accidentally remounts:

```javascript
pickUpItem: (item) => set(state => ({
  inventory: state.inventory.find(i => i.id === item.id)
    ? state.inventory
    : [...state.inventory, item]
}))
```

Phase 3.5 will move items from `App.jsx` initialization into `Item.jsx` world objects. When a player walks up to a glowing item and presses E, it calls `pickUpItem` and the world store's `markPickedUp` — removing the 3D item from the scene and adding it to the inventory.

---

## HUD Layout

The full HUD uses `position: fixed` for all elements, positioned independently with specific `top`/`bottom`/`left` values:

| Element | Position |
|---|---|
| Compass | `top: 18px`, horizontally centered |
| Stat bars | `top: 64px` (below compass), `left: 18px` |
| Crosshair | `50vw, 50vh` (exact center) |
| Interaction prompt | `50% - 38px` from vertical center |
| Feedback message | `top: 37%` |
| Inventory bar | `bottom: 54px`, horizontally centered |
| HUD hints | `bottom: 18px`, horizontally centered |

This stacking order avoids conflicts. All elements have `pointerEvents: 'none'` so they don't block mouse interaction with the canvas below (which is critical — mouse look must reach the canvas).

---

## Files Created or Modified

| File | What changed |
|---|---|
| `src/store/useGameStore.js` | **Modified.** Added `cameraYaw`/`setCameraYaw`; replaced `equippedItem`/`equipItem`/`unequip` with `equippedSlot`/`equipSlot`; made `pickUpItem` idempotent |
| `src/App.jsx` | **Modified.** Added `CameraSync` component (syncs yaw at 20Hz); added starter item seeding via `useEffect` |
| `src/components/Player.jsx` | **Modified.** Added `equipSlot` import; added `keydown` listener for 1–5 hotkeys |
| `src/components/Overlay.jsx` | **Rewritten.** Full HUD: polished stat bars with glass sheen and color transitions, compass strip with bearing math, inventory quick bar with 5 slots, updated start screen controls list |
