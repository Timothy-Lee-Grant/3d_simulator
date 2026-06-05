# Procedural Idle Animation

> How `Human.jsx` makes three standing figures look alive using nothing but `Math.sin()`, React refs, and R3F's `useFrame` hook — no keyframes, no animation files, no external tools.

---

## What Procedural Animation Is

There are two fundamental ways to animate a 3D character:

**Keyframe animation:** An artist manually poses the character at specific points in time (keyframes). The engine interpolates between those poses. This is how GLTF animations work — the file stores a timeline of bone positions that the `AnimationMixer` plays back. The result looks polished because a human designed every pose, but it's rigid: each clip plays exactly as authored.

**Procedural animation:** Math functions compute the character's pose every frame at runtime. No artist poses anything — the motion emerges from equations. The result is infinitely varied (the same function never produces the exact same motion twice in a long session), reacts to parameters (slow breathing vs fast, subtle vs exaggerated), and costs zero disk space.

For idle animations — the gentle, continuous movement of a character who is just standing there — procedural is often the better choice. A looping idle keyframe clip always repeats at the same pace and can feel mechanical. A procedural idle never exactly repeats.

---

## The Sine Wave: The Foundation of All Procedural Motion

Every animation in this implementation uses a single mathematical primitive:

```
value(t) = A × sin(ω × t + φ)
```

Where:
- `t` is time in seconds (from `clock.getElapsedTime()`)
- `A` is **amplitude** — how far the value swings from center (peak-to-center distance)
- `ω` is **angular frequency** in radians/second — how fast the oscillation runs
- `φ` is **phase offset** — shifts the entire wave forward or backward in time

The sine function has three properties that make it ideal for idle animation:

1. **Continuous** — it never has sharp jumps or discontinuities. Motion is always smooth.
2. **Bounded** — it always stays between -1 and +1, so multiplying by an amplitude gives a guaranteed range.
3. **Periodic** — it repeats perfectly, so motion cycles without any special handling.

### Converting between Hz and rad/s

The `sin` function's argument is in radians. To make it oscillate at a desired frequency in Hz (cycles per second), multiply time by `ω = 2π × Hz`:

```javascript
// One breath every 2.2 seconds = 0.45 Hz
const ω = 2 * Math.PI * 0.45   // ≈ 2.83 rad/s
const breathe = Math.sin(t * 2.83)
```

The frequencies chosen for this character:

| System | Frequency | Period | ω (rad/s) |
|---|---|---|---|
| Breathing | 0.45 Hz | 2.2 s | 2.83 |
| Arm sway | 0.30 Hz | 3.3 s | 1.88 |
| Weight shift | 0.12 Hz | 8.4 s | 0.75 |
| Head look | 0.17 Hz | 5.9 s | 1.07 |
| Head nod | 0.23 Hz | 4.3 s | 1.45 |

These frequencies are chosen so that **no two systems are harmonically related** — if one frequency were exactly twice another, the two motions would phase-lock and look robotic. Having incommensurable frequencies (non-integer ratios) means the combined motion never exactly repeats within a practical session length.

---

## The Architecture: Two Nested Groups

This is the most important structural decision in the file.

### The problem

In R3F, you control objects two ways:

1. **Declaratively via JSX props:** `<group position={[0, 1.7, 0]} />` — React owns this transform and reconciles it on every render.
2. **Imperatively via refs:** `ref.current.position.y = 0.004` — you own this, modified in `useFrame`.

These two systems can fight. If React reconciles the component and resets `position.y` back to the prop value (zero), your animation produces a visible snap. For stable scenes this is rare, but it's a real issue during hot-module reloads and any parent re-render.

### The solution: separate concerns with two groups

```jsx
// Outer group — React-controlled: holds the world position from props
<group position={position} rotation={rotation}>

  // Inner group — useFrame-controlled: no React props, safe to mutate
  <group ref={bodyRef} name="human">
    <Head /> <Torso /> <Arms /> <Legs />
  </group>

</group>
```

The outer group is the world-space anchor. React sets it once (from props) and never changes it unless props change. The inner `bodyRef` group has no React-controlled transform properties — `position` and `rotation` start at their default (zero), and `useFrame` mutates them freely. React will never reset them.

---

## The Shoulder Pivot: Why Group Position Matters

When you rotate a `<group>`, the rotation happens around the **group's origin** — the point (0, 0, 0) in that group's local coordinate system.

Before this implementation, the `Arm` component looked like this:

```jsx
function Arm({ side }) {
  const x = side === 'left' ? -0.215 : 0.215
  return (
    <group name={`arm-${side}`}>                       // ← origin at (0, 0, 0) = GROUND
      <Sph position={[x, 1.27, 0]} />                 // shoulder at world y=1.27
      <Cyl position={[x, 1.10, 0]} />                 // upper arm
      ...
    </group>
  )
}
```

The group's origin was at ground level (y=0). Rotating `group.rotation.x` would swing the entire arm in a huge arc pivoting around the ground — obviously wrong.

The fix: **move the group's origin to the shoulder joint**, and express all geometry positions relative to that origin:

```jsx
function Arm({ side, groupRef }) {
  const xPivot = side === 'left' ? -0.215 : 0.215

  return (
    // Group origin IS the shoulder joint
    <group ref={groupRef} name={`arm-${side}`} position={[xPivot, 1.27, 0]}>
      <Sph position={[0, 0, 0]}       />   // shoulder cap — AT the pivot
      <Cyl position={[0, -0.17, 0]}   />   // upper arm hangs DOWN from pivot
      <Cyl position={[0, -0.49, 0]}   />   // forearm
      <Box position={[0, -0.67, 0.01]}/>   // hand
    </group>
  )
}
```

Now `groupRef.current.rotation.x = 0.055` rotates the arm 0.055 radians around the shoulder joint — the only physically correct behavior.

**The math for converting geometry positions:**

```
new_local_position = world_position - pivot_position

upper arm was at world [x, 1.10, 0], pivot at [x, 1.27, 0]:
→ local [x-x, 1.10-1.27, 0] = [0, -0.17, 0]
```

This transformation pattern applies to any body part you want to animate: find the joint's world position, move the group's origin there, subtract the joint position from all child positions.

---

## The useFrame Loop

```javascript
useFrame(({ clock }) => {
  const t = clock.getElapsedTime() + phaseOffset

  // One sine value per motion system
  const breathe = Math.sin(t * BREATH)
  const sway    = Math.sin(t * SWAY)
  const shift   = Math.sin(t * SHIFT)
  const look    = Math.sin(t * LOOK)
  const nod     = Math.sin(t * NOD)

  // Whole body — breathing rise + weight shift lean
  if (bodyRef.current) {
    bodyRef.current.position.y = breathe * 0.004
    bodyRef.current.rotation.z = shift   * 0.011
  }

  // Torso — chest expansion
  if (torsoRef.current) {
    torsoRef.current.scale.x = 1 + breathe * 0.005
    torsoRef.current.scale.y = 1 + breathe * 0.010
  }

  // Arms — opposite-phase pendulum swing
  if (armLRef.current) armLRef.current.rotation.x =  sway * 0.055
  if (armRRef.current) armRRef.current.rotation.x = -sway * 0.055

  // Head — slow scan + nod
  if (headRef.current) {
    headRef.current.rotation.y = look * 0.065
    headRef.current.rotation.x = nod  * 0.022
  }
})
```

### What each body part does

**Whole body breathing rise** (`bodyRef.position.y`): The entire character rises ±4mm with each breath. Subtle — you wouldn't consciously notice it — but its absence makes the character feel heavier and less alive.

**Weight shift lean** (`bodyRef.rotation.z`): A very slow ±0.6° tilt side to side. When a human stands for a long time, they shift weight from foot to foot. This approximates that — without actually moving the legs — by gently rocking the body.

**Chest expansion** (`torsoRef.scale`): The torso box geometry scales ±1% in Y and ±0.5% in X — a barely visible chest expansion on each breath. The scale is applied to the group, so both the chest and abdomen meshes are affected together.

**Arm pendulum sway** (`armLRef.rotation.x`, `armRRef.rotation.x`): The left and right arms swing forward and back at `SWAY` frequency. The critical detail: they use **opposite signs** (`+sway` vs `-sway`). When left arm swings forward, right arm swings back — the natural counterbalancing motion of a standing human. Both use the same `sway` value but opposite signs, producing a single smooth sine wave split between them.

**Head look and nod**: Two independent sine waves at different frequencies drive the head's Y and X rotations. The incommensurable frequencies (1.07 and 1.45 rad/s) mean the head traces a slightly different path each cycle, making it feel like the character is actually looking around rather than executing a loop.

---

## Phase Offset: Making Three Humans Look Like Three People

The three humans in the scene share exactly the same component code and the same `useFrame` logic. Without intervention, they'd all breathe, sway, and look in perfect synchrony — clone-like, obviously mechanical.

The `phaseOffset` prop solves this by adding a constant to the time input:

```javascript
const t = clock.getElapsedTime() + phaseOffset
```

The three instances use offsets `0.0`, `2.1`, and `4.7` seconds. Since the breath cycle is 2.2 seconds long, these offsets put each human at a completely different point in their breath cycle at any given moment:

```
Time = 5.0 seconds:
  Human 1: t = 5.0 + 0.0 = 5.0 → sin(5.0 × 2.83) = sin(14.15) ≈ +0.66  (exhaling)
  Human 2: t = 5.0 + 2.1 = 7.1 → sin(7.1 × 2.83) = sin(20.09) ≈ -0.90  (inhaling)
  Human 3: t = 5.0 + 4.7 = 9.7 → sin(9.7 × 2.83) = sin(27.45) ≈ +0.32  (mid-breath)
```

Each human looks completely different — chest expanded vs compressed, arms at different angles, head pointing in different directions — despite sharing identical math.

### Choosing phase offsets

Phase offsets should be spread relative to the **slowest** cycle in your system. The weight shift has a period of 8.4 seconds. To ensure three humans look distinct across that full cycle, offsets should span at least half of it. Offsets of 0.0, 2.1, 4.7 cover 4.7 seconds of the 8.4s cycle — roughly half the slowest period, giving distinct poses at any given moment.

---

## The `if (ref.current)` Guards

Every animated ref access is guarded:

```javascript
if (bodyRef.current) {
  bodyRef.current.position.y = breathe * 0.004
}
```

These checks are not strictly necessary in normal operation — R3F populates refs before `useFrame` first runs. But they protect against edge cases during development:

- **Hot Module Replacement (HMR):** When Vite reloads a module, components may briefly unmount and remount. During the window between unmount and remount, `ref.current` is `null`.
- **Strict Mode double-invoke:** React 18's Strict Mode intentionally mounts → unmounts → remounts every component in development to surface side-effect bugs. The guard prevents a crash during the brief null window.

In production builds, these guards cost nothing — the condition is always true and the check is trivially fast.

---

## Scaling This Up: What Comes Next

This procedural idle is a foundation. The same architecture extends to:

**Walk cycle:** Add a `moving` prop. When true, drive the legs with a gait frequency matched to the step sound system. Left leg swings forward when right arm swings forward (the natural cross-body gait pattern). The same sine wave driving arm sway can drive leg movement — just use the same `sway` value on opposite legs.

**Look-at targeting:** Replace the `look` sine wave with a direction computed from a target position. `lookAt(targetPosition)` gives a quaternion; slerp the head group's quaternion toward it over time. The character appears to notice and watch things.

**Emotion states:** A `state` prop (`'idle'`, `'alert'`, `'frightened'`) changes the animation parameters. Frightened: faster breathing frequency, arms pulled in (smaller sway amplitude), head rotating faster and more erratically. Same math, different numbers.

**Procedural walk animation:** `useFrame` accumulates a walk phase as the player moves NPCs. Legs swing using `sin(walkPhase)` and `sin(walkPhase + π)`. The walk phase increments proportional to movement speed — faster movement means faster leg cycling.

---

## Files Changed

| File | What changed |
|---|---|
| `src/components/Human.jsx` | Added `useFrame` import, animation frequency constants, `groupRef` props on Head/Torso/Arm, restructured Arm with shoulder-pivot origin, two-group root pattern, full `useFrame` animation loop, `phaseOffset` prop |
| `src/App.jsx` | Added `phaseOffset={0.0 / 2.1 / 4.7}` to the three Human instances |
