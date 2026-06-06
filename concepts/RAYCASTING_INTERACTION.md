# Raycasting and Interaction

> How the scene detects what the player is looking at and responds when they press E — covering ray-object intersection, forward raycasting from the camera, the interactables registry, and the store-driven feedback loop.

---

## What a Ray Is

A ray is a mathematical object: a point in 3D space (the **origin**) plus a direction vector (the **direction**), extending infinitely forward from that origin. It has no width, no thickness — just a line.

**Raycasting** fires this line into the scene and asks: which objects does it pass through, and in what order? The answer is a list of **intersections**, each containing:

- The object that was hit
- The hit point in world space (`intersection.point`)
- The surface normal at the hit point (`intersection.face.normal`)
- The distance from the ray origin to the hit point (`intersection.distance`)

This test — "does this infinite line pass through this 3D solid?" — is one of the most fundamental operations in real-time 3D. It powers clicking on objects, shooting, door opening, picking up items, and terrain height detection.

---

## The Forward Ray: First-Person Interaction

In a first-person game with a locked pointer, there's no mouse cursor to click with. Instead, the player interacts with whatever they're **looking at** — the object their crosshair points at.

To find that object, we fire a ray from the camera, through the center of the viewport, along the camera's forward direction:

```javascript
raycaster.setFromCamera({ x: 0, y: 0 }, camera)
```

The two arguments are:
- **`{ x: 0, y: 0 }`** — normalised device coordinates (NDC). `(0, 0)` is the exact center of the viewport. `(-1, -1)` is the bottom-left corner, `(1, 1)` is the top-right. The crosshair is at `(0, 0)`.
- **`camera`** — Three.js uses the camera's projection matrix and world transform to deproject this NDC point back into world space, producing the correct ray origin and direction.

The result is a ray that originates at the camera and travels exactly where the player is looking.

---

## Why Not Use onClick?

R3F meshes support `onClick`, `onPointerEnter`, and `onPointerLeave` events — they fire when the user clicks or hovers with their actual mouse cursor. This works fine for UI elements and non-pointer-lock scenarios.

In pointer lock mode, the mouse cursor is captured and hidden. There is no cursor position — the pointer is locked to the center of the screen. Click events still fire when the mouse button is pressed, but they come through at the captured center position, not a meaningful screen coordinate.

Two reasons to use the explicit raycaster approach instead:

1. **Continuous detection** — we want to know what the player is looking at every frame, not just when they click. The "Press E" prompt must appear and disappear as they look toward and away from NPCs. `onClick` only fires at click time.

2. **E key interaction** — the player presses `E`, not a mouse button, to interact. That keypress is detected in `useFrame`; it needs to know what the raycaster found that same frame.

---

## System Architecture

The interaction system is split across four files, each with a single responsibility.

```
Player.jsx          — runs the raycaster every frame via useRaycast()
                      detects E key and calls interact()

useRaycast.js       — fires the forward ray, writes lookingAt to the store

interactables.js    — module-level Map of registered Object3D targets
                      NPC components register/deregister on mount/unmount

useInteractionStore.js  — Zustand store: lookingAt + lastInteraction

NPC.jsx             — reads the store; shows highlight ring when targeted

Overlay.jsx         — reads the store; shows "Press E" prompt + feedback
```

The data flow forms a clean loop:

```
Scene geometry (NPC.jsx)
      ↓ registers roots in
interactables.js
      ↓ queried by
useRaycast.js (runs inside Player.jsx useFrame)
      ↓ writes to
useInteractionStore
      ↑ read by                    ↑ read by
NPC.jsx (highlight ring)     Overlay.jsx (prompt + feedback)
```

No prop drilling. No React context. No tight coupling between Player and NPC.

---

## The Interactables Registry

```javascript
// src/systems/interactables.js
const registry = new Map()

export function registerInteractable(id, object, meta) {
  registry.set(id, { object, meta })
}

export function deregisterInteractable(id) {
  registry.delete(id)
}

export function getInteractableObjects() {
  return Array.from(registry.values()).map(entry => entry.object)
}
```

This is a plain JavaScript module — no React, no hooks, no Zustand. It's a global Map that exists for the lifetime of the page.

**Why not Zustand?** Three.js `Object3D` instances are mutable objects with internal state (geometry buffers, matrix transforms, material references). Putting them in a React state store would be wrong — React/Zustand assume state is immutable data that can be compared for changes. Three.js objects are exactly the opposite: they're mutated every frame.

**Why not React context?** Context requires a Provider component and re-renders consumers when the value changes. Refs don't change — the same `Object3D` lives at the same memory address for the component's lifetime. Using context would mean restructuring the component tree and accepting unnecessary renders.

A module-level Map sidesteps all of this: it's written once (on mount), read once per frame (in `useFrame`), and deleted on unmount. Zero React overhead.

### Finding the registered root from a hit

`raycaster.intersectObjects(objects, true)` with `recursive: true` returns the deepest descendant mesh that the ray hit — not the root group that was registered. An NPC consists of ~30 meshes (head, torso, arms, legs). The raycaster might return the hit on a forearm cylinder.

`findInteractableByHit` walks the hit object's parent chain until it finds the registered root:

```javascript
export function findInteractableByHit(hitObject) {
  let current = hitObject
  while (current) {
    for (const [id, entry] of registry.entries()) {
      if (entry.object === current) return { id, meta: entry.meta }
    }
    current = current.parent
  }
  return null
}
```

This is the standard solution to the "I hit a child, find the parent" problem. The walk is O(depth × registeredCount) — for 3 NPCs and ~5 levels of hierarchy, that's 15 comparisons per hit. Negligible.

---

## The Raycasting Hook

```javascript
// src/hooks/useRaycast.js
const raycaster = useMemo(() => new Raycaster(), [])

useFrame(() => {
  const interactableObjects = getInteractableObjects()

  raycaster.setFromCamera(NDC_CENTER, camera)
  const hits = raycaster.intersectObjects(interactableObjects, true)

  if (hits.length > 0 && hits[0].distance <= INTERACTION_RANGE) {
    const found = findInteractableByHit(hits[0].object)
    if (found) {
      setLookingAt({ id: found.id, name: found.meta.name, distance: hits[0].distance })
      return
    }
  }

  setLookingAt(null)
})
```

Three design decisions worth noting:

**`useMemo` for the Raycaster** — `new Raycaster()` allocates memory. Creating it inside `useFrame` would allocate a new instance every frame — 60× per second. `useMemo` with an empty dependency array creates it once on component mount and reuses it forever.

**Only raycast against registered objects** — `getInteractableObjects()` returns 3 objects (one per NPC). Testing against the whole scene (hundreds of meshes) every frame would be expensive. The explicit opt-in list keeps the test set small.

**`INTERACTION_RANGE = 3.0`** — even if the ray hits an NPC, we only count it if the hit is within 3 world units (approximately arm's reach for a character with eye height 1.7 units). Beyond 3 units, the player sees the prompt but can't interact — this would feel wrong, so we set the range consistently.

---

## NPC Registration

```javascript
// src/components/NPC.jsx
const rootRef = useRef()

useEffect(() => {
  if (!rootRef.current) return
  registerInteractable(npcId, rootRef.current, { name })
  return () => deregisterInteractable(npcId)
}, [npcId, name])
```

The `useEffect` runs after the component mounts and the ref is populated. It registers the root group as the interactable target. The cleanup function deregisters it when the component unmounts — essential to prevent the raycaster from testing against freed objects.

The `ref` is attached to the outermost `<group>` that contains all of the NPC's geometry. Because `intersectObjects` uses `recursive: true`, it will descend into all child meshes. But registration only needs the root — `findInteractableByHit` can trace back up from any child.

---

## The Highlight Ring

When the player looks at an NPC, a thin glowing ring appears at their feet. This is the standard "selectable target" feedback pattern.

```jsx
<mesh
  ref={ringRef}
  position={[0, 0.02, 0]}
  rotation={[-Math.PI / 2, 0, 0]}   // flat on the ground
>
  <torusGeometry args={[0.55, 0.025, 8, 32]} />
  <meshStandardMaterial
    color="#88ccff"
    emissive="#4499ee"
    emissiveIntensity={0}
    transparent
    opacity={0}
    depthWrite={false}
  />
</mesh>
```

The ring starts invisible (`opacity: 0`, `emissiveIntensity: 0`). Each frame, `useFrame` lerps these values toward their targets:

```javascript
useFrame(() => {
  const target = isTargeted ? 1 : 0
  highlightVal.current += (target - highlightVal.current) * 0.18

  const v = highlightVal.current
  ringRef.current.scale.setScalar(1 + v * 0.08)       // slight pulse scale
  mat.opacity           = v * 0.85
  mat.emissiveIntensity = v * 2.5
})
```

**Why lerp instead of a hard switch?** A hard toggle (`opacity = isTargeted ? 0.85 : 0`) would produce a visible pop as the ring appears and disappears. The lerp creates a smooth 10-frame fade-in/out at 60fps, which feels intentional rather than mechanical.

**`depthWrite: false`** — the ring is a transparent mesh lying on the ground. Without this flag, it would write to the depth buffer and occlude parts of the ground behind it, creating visual artifacts. Transparent objects that lay on surfaces should generally not write depth.

**`emissiveIntensity: 2.5`** — `meshStandardMaterial` with `emissive` color only shows the emissive color if `emissiveIntensity > 0`. At 2.5, the ring glows noticeably even in the shadow areas under the NPCs, which is where players will often look.

---

## E Key: Edge Detection

Keyboard keys are held down for multiple frames. Naively checking `if (keys.current['KeyE'])` in `useFrame` would fire the interaction 60 times per second while the key is held — opening a dialogue 60 times, playing a sound 60 times, picking up an item 60 times.

**Edge detection** fires only on the transition from "not pressed" to "pressed":

```javascript
const ePressedLastFrame = useRef(false)

// In useFrame:
const eDown = keys.current['KeyE']

if (eDown && !ePressedLastFrame.current && lookingAt) {
  interact(lookingAt)   // fires exactly once per key press
}
ePressedLastFrame.current = !!eDown
```

`ePressedLastFrame` stores whether E was held last frame. The condition `eDown && !ePressedLastFrame.current` is true only for the single frame where the key transitions from up to down — the leading edge. All subsequent frames where the key is still held, `ePressedLastFrame.current` is also true, so the condition is false.

This is the same pattern used in game engines for "just pressed" detection. It's one line of state and one condition.

---

## The Overlay: Prompt and Feedback

The Overlay reads from the store using Zustand selectors:

```javascript
const lookingAt       = useInteractionStore(state => state.lookingAt)
const lastInteraction = useInteractionStore(state => state.lastInteraction)
```

**The prompt** uses CSS `opacity` and `transform` transitions to animate in and out:

```jsx
<div style={{
  ...styles.interactPrompt,
  opacity:   lookingAt ? 1 : 0,
  transform: lookingAt ? 'translate(-50%, 0)' : 'translate(-50%, 6px)',
}}>
  <span style={styles.keyBadge}>E</span>
  &nbsp;&nbsp;Inspect {lookingAt?.name}
</div>
```

The `transform: translate(-50%, 6px)` when hidden shifts the prompt down 6px, creating a subtle "rise in" animation as it becomes visible. This is a common UI micro-animation: elements enter by rising slightly and fade in simultaneously.

**The feedback** uses a `useEffect` that watches `lastInteraction`. Each time the player presses E, `lastInteraction` updates (new timestamp + name), the effect fires, shows a message, and clears it after 2 seconds:

```javascript
useEffect(() => {
  if (!lastInteraction) return
  setFeedbackMsg(`You greeted ${lastInteraction.name}`)
  const timer = setTimeout(() => setFeedbackMsg(null), 2000)
  return () => clearTimeout(timer)
}, [lastInteraction])
```

The cleanup function cancels the timeout if `lastInteraction` changes again before 2 seconds — prevents stale messages lingering when the player rapidly interacts with multiple NPCs.

**The crosshair** changes color when looking at an interactable — from white to a soft blue matching the highlight ring:

```jsx
background: lookingAt ? 'rgba(136, 204, 255, 0.9)' : 'rgba(255,255,255,0.85)'
```

This subtle color shift gives early feedback before the player notices the ring — a layered communication strategy used in most modern games.

---

## What Comes Next

This system is the foundation for all future interactions. Extending it requires no changes to the raycasting or registry infrastructure:

**NPC dialogue** — instead of `interact()` logging a simple message, it sets `dialogueState` in a dialogue store. The Overlay reads that store and renders a full dialogue panel.

**Collectible items** — an `Item.jsx` component registers itself with the interactables system, just like `NPC.jsx`. The `interact()` action for an item calls `pickUpItem(id)` in a game store and the item conditionally unmounts.

**Doors** — a `Door.jsx` component registers its group. Pressing E toggles an `isOpen` state and plays an animation.

**Shooting** — a weapon fires a raycast using the same `Raycaster.setFromCamera` call, but against all scene objects (not just interactables) and with an `INTERACTION_RANGE` of 100+.

**Terrain height detection** — a downward ray (`raycaster.set(position, new Vector3(0, -1, 0))`) fired from the player's feet each frame detects the terrain surface below them, enabling the player to walk on sloped terrain.

---

## Files Created or Modified

| File | What changed |
|---|---|
| `src/store/useInteractionStore.js` | **New.** Zustand store: `lookingAt`, `lastInteraction`, `setLookingAt`, `interact` |
| `src/systems/interactables.js` | **New.** Module-level registry: `registerInteractable`, `deregisterInteractable`, `getInteractableObjects`, `findInteractableByHit` |
| `src/hooks/useRaycast.js` | **New.** Forward raycaster hook: fires NDC-center ray every frame, updates store |
| `src/components/NPC.jsx` | **New.** Human wrapper: registers with interactables, shows highlight ring |
| `src/components/Player.jsx` | **Modified.** Added `useRaycast()` call, E key edge detection, `interact()` call |
| `src/components/Overlay.jsx` | **Modified.** Added interaction prompt, feedback message, updated crosshair color change, updated control hints |
| `src/App.jsx` | **Modified.** Replaced `Human` with `NPC`, added `npcId` and `name` props |
