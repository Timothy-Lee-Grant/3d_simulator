# Building a Human from Primitives

> How `Human.jsx` constructs a standing humanoid figure without any external model file, using only Three.js geometry — and what this teaches you about 3D character construction in general.

---

## The Core Idea

There are two ways to put a human character in a 3D scene:

1. **Load a pre-made model** — an artist sculpts a character in Blender, exports it as a `.glb` file, and you load it with `useGLTF('/character.glb')`. One line of code, professional result.
2. **Build it from primitives** — assemble boxes, cylinders, and spheres into a human shape entirely in code.

Option 1 is what you'll do in production. Option 2 is what `Human.jsx` does — and it's worth understanding because it forces you to think explicitly about everything a 3D character actually is: geometry, hierarchy, proportions, and coordinate space.

---

## Step 1: Establishing Proportions

Before writing a single line of code, you need a measurement system. Real human proportions are traditionally described in "heads" — the height of the head is used as the base unit, and everything else is a multiple of it.

A real adult human is roughly 7.5 heads tall:

```
7.5 ── top of head
6.5 ── chin
6.0 ── shoulder
4.5 ── elbow / waist
3.5 ── wrist / hip
2.5 ── knee
0.5 ── ankle
0.0 ── ground
```

For the game, we want the figure to be roughly 1.7 units tall (matching real-world meters, since the player's eye height is 1.7). If we set 1 head = ~0.23 units, then 7.5 heads ≈ 1.72 units total height. The full anatomy map in `Human.jsx` is derived from this:

```
1.72 ── top of hair
1.60 ── top of head
1.36 ── chin
1.26 ── shoulder
0.92 ── elbow
0.88 ── waist
0.68 ── hip bottom
0.62 ── wrist
0.44 ── knee
0.10 ── ankle
0.00 ── ground
```

Write this out before you write code. Without it, you're guessing, and you'll spend hours nudging numbers.

---

## Step 2: Choosing Geometry for Each Body Part

Three.js gives us a handful of primitive shapes. Each body part maps naturally to one:

| Body Part | Geometry | Why |
|---|---|---|
| Torso, head, hands, feet | `BoxGeometry` | Flat planes, clearly defined shape |
| Thighs, shins, forearms, upper arms, neck | `CylinderGeometry` | Limbs are roughly tubular |
| Shoulders, elbows, knees, ankles | `SphereGeometry` | Joints are rounded, connect cylinders smoothly |

This is the same logic real-time game characters used before polygon budgets became generous — games like Quake 1 used this exact approach.

### CylinderGeometry arguments

```jsx
<cylinderGeometry args={[radiusTop, radiusBottom, height, radialSegments]} />
```

- **radiusTop / radiusBottom**: making them slightly different (e.g., `0.068` top, `0.062` bottom) gives limbs a subtle taper — thicker at the top, thinner at the bottom — which looks more natural than a perfect cylinder.
- **radialSegments**: how many sides the cylinder has. `8` gives a faceted look. `16` looks smoother. More segments = more triangles. For a character made of many parts, keeping segments low (8) matters for performance.

### SphereGeometry arguments

```jsx
<sphereGeometry args={[radius, widthSegments, heightSegments]} />
```

Joint spheres in the human use `12, 9` — 12 columns, 9 rows. That's 216 triangles per sphere. Since we have ~8 joint spheres, that's ~1,728 triangles just for joints. Always ask: "how many of these will be on screen?" One human is fine. A hundred humans with high-poly spheres would be expensive.

---

## Step 3: The Scene Graph Hierarchy

The most important architectural decision in `Human.jsx` is how to organize the body parts into a hierarchy. A human is not a flat list of meshes — it's a tree:

```
<group name="human">        ← root: position + rotation of entire figure
  <group name="head">       ← skull, hair, eyes, ears, neck
  <group name="torso">      ← chest, abdomen, waistband
  <group name="hips">       ← pelvis region
  <group name="arm-left">   ← shoulder, upper arm, elbow, forearm, hand, thumb
  <group name="arm-right">
  <group name="leg-left">   ← thigh, knee, shin, ankle, foot
  <group name="leg-right">
```

### Why hierarchy matters

**Collective transforms:** Moving the root `<group name="human">` moves the entire figure. You don't touch each mesh individually — the group propagates the transform to all children.

**Relative positioning:** Every mesh inside `<group name="head">` is positioned relative to the head group's origin, not the world origin. When you read `position={[0, 1.47, 0]}` on the head group and `position={[0, 0, 0]}` on the skull inside it, the skull's world position is `(0, 1.47, 0)`. The skull doesn't know or care where the human stands in the world — it only knows it's at the center of the head group.

**Foundation for animation:** This is the most critical reason. When you eventually add animation, you animate the groups, not individual meshes. Rotating `<group name="arm-left">` around a shoulder pivot rotates the entire arm — upper arm, elbow sphere, forearm, hand, thumb — all at once, as a unit. This is exactly what a skeleton does in a real animated character.

```jsx
// Future animation example — rotate the arm group around the shoulder
useFrame((_, delta) => {
  armRef.current.rotation.z = Math.sin(clock * 2) * 0.4
  // Every mesh inside the arm group follows this rotation
})
```

Without the group hierarchy, you'd have to calculate and set the rotation of each individual mesh separately. That's not just tedious — it's mathematically wrong, because each mesh would rotate around its own center rather than around the shoulder joint.

---

## Step 4: Building Each Region

### The head

The head is the most detailed region because it's what the player focuses on. It's composed of:

- A **skull box** — the base shape, skin-colored
- **Hair boxes** — four overlapping boxes: one cap on top, one on each side, one at the back. Overlapping boxes is a classic technique for building shapes that aren't simple rectangles.
- **Eye boxes** — two small flat boxes on the front face (+Z side) of the skull
- A **mouth box** — a thin horizontal rectangle below the eyes
- **Ear boxes** — small boxes protruding from the sides of the skull
- A **neck cylinder** — positioned below the skull, connecting to the torso

The face features sit at `z = 0.12` — slightly proud of the skull face (which extends from `z = -0.12` to `z = +0.12`). This ensures they're visible and not clipping into the skull surface.

**Which way does the face point?**

The face features (eyes, mouth) are placed at positive Z values, meaning the face points in the **+Z direction** in the figure's local space. In Three.js's right-hand coordinate system, +Z points toward the viewer. When we place the human with `rotation={[0, Math.PI, 0]}` (180° around Y), the face rotates to look in the **-Z direction** — which is toward the player at spawn. Without that rotation, the human would have its back to you.

### Limbs

Both `Arm` and `Leg` are parameterized by a `side` prop:

```jsx
function Arm({ side }) {
  const x = side === 'left' ? -0.215 : 0.215
  // ... all positions use x for the X offset
}
```

This is the Don't Repeat Yourself principle applied to 3D. The left and right arms are mirror images — the only difference is the X coordinate sign. One component handles both, parameterized by `side`. If you decide to change arm thickness, you change it in one place and both arms update.

**Limb tapering:** Limbs taper slightly from top to bottom:
```jsx
// Thigh: wider at hip, narrower at knee
<cylinderGeometry args={[0.068, 0.062, 0.30, 8]} />
//                       ^top    ^bottom
```

This subtle 6mm difference creates a much more natural silhouette than a perfect cylinder.

**Joint spheres:** Each joint (knee, elbow, ankle, shoulder) has a small sphere placed at the junction between two cylinder segments. This hides the hard edge where cylinder end-caps meet — an artist trick used in low-poly character design since the early 2000s.

---

## Step 5: The Primitive Shorthand Components

Rather than repeating the full JSX for every mesh, `Human.jsx` defines three internal helper components:

```jsx
function Box({ size, position, color, rotation }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}

function Cyl({ args, position, rotation, color }) { ... }
function Sph({ radius, position, color }) { ... }
```

These are **not exported** — they're private to `Human.jsx`. They exist purely to reduce repetition within this file. Compare what body part code looks like with and without them:

```jsx
// Without shorthand — 5 lines per mesh, very noisy:
<mesh position={[x, 0.51, 0]} castShadow>
  <cylinderGeometry args={[0.068, 0.062, 0.30, 8]} />
  <meshLambertMaterial color="#2C3E50" />
</mesh>

// With shorthand — 1 line, reads like a description:
<Cyl args={[0.068, 0.062, 0.30, 8]} position={[x, 0.51, 0]} color={C.pants} />
```

This is component composition as a noise-reduction tool, not as a reusability tool. The `Box`, `Cyl`, and `Sph` components will never be used outside `Human.jsx`.

---

## Step 6: The Color Palette

Colors are defined once as constants:

```jsx
const C = {
  skin:  '#D4956A',
  hair:  '#2E1A0E',
  shirt: '#4A6FA5',
  pants: '#2C3E50',
  shoe:  '#1C1810',
  eye:   '#1A1A2E',
  mouth: '#A0604A',
}
```

Using a palette object (`C.skin`, `C.pants`) instead of inline hex strings has two benefits:

1. **Consistency** — every skin-colored part uses the same value
2. **Easy reskinning** — to give the character a different skin tone or outfit, change the palette. With inline strings you'd hunt through dozens of `color="#D4956A"` values.

This is the first step toward a character customization system. A future version might accept a `palette` prop:

```jsx
<Human palette={{ shirt: '#CC2200', pants: '#111111' }} />
// Red shirt, black pants — no changes to geometry logic needed
```

---

## Step 7: Placing Multiple Humans

In `App.jsx`, three humans are placed with different positions and rotations:

```jsx
<Human position={[0,   0, -5]}  rotation={[0, Math.PI,       0]} />
<Human position={[2.5, 0, -7]}  rotation={[0, Math.PI * 1.3, 0]} />
<Human position={[-2,  0, -6]}  rotation={[0, Math.PI * 0.8, 0]} />
```

Each is a separate instance of the same component with different props. React Three Fiber creates a separate Three.js group hierarchy for each — they share the same component definition but each has its own set of Three.js objects in memory.

**Rotation:** `Math.PI` = 180° (facing toward the player). `Math.PI * 1.3` = 234° (turned slightly away, looking into the distance). These are in radians, applied to the Y axis (yaw — horizontal turning).

**A note on instancing:** Three separate `<Human />` components means three separate draw calls per mesh in each human. The full figure is about 30 meshes × 3 humans = 90 draw calls. This is fine for a handful of characters. For a crowd of hundreds, you'd use `InstancedMesh` — one draw call for all instances — at the cost of losing per-instance material variation.

---

## The Upgrade Path: From Primitives to GLTF

The component is designed so that replacing it with a real model is surgical. In `App.jsx`:

```jsx
<Human position={[0, 0, -5]} rotation={[0, Math.PI, 0]} />
```

This line doesn't change. Only `Human.jsx` changes:

```jsx
// Current Human.jsx — primitive geometry
export default function Human({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <Head />
      <Torso />
      {/* ... */}
    </group>
  )
}

// Future Human.jsx — GLTF model
import { useGLTF, useAnimations } from '@react-three/drei'

export default function Human({ position, rotation }) {
  const { scene, animations } = useGLTF('/models/human.glb')
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    actions['Idle']?.play()
  }, [actions])

  return <primitive object={scene} position={position} rotation={rotation} />
}
```

Same props in, same visual result out (but much better looking). Everything that uses `<Human />` is unchanged. This is the payoff of component encapsulation: the implementation is hidden behind a stable interface.

---

## Summary

| Concept | Applied in Human.jsx |
|---|---|
| Primitive geometry assembly | Boxes, cylinders, spheres combined into a humanoid silhouette |
| Scene graph hierarchy | Named `<group>` regions mirroring a skeleton's bone structure |
| Proportions | Measurement map derived from real human anatomy (7.5 heads tall) |
| Relative positioning | All mesh positions are local to their parent group |
| Parameterization | `side` prop mirrors left/right limbs from one component definition |
| Limb tapering | Different top/bottom radii on cylinders for natural shape |
| Joint spheres | Spheres hide cylinder end-cap edges at joints |
| Internal helpers | `Box`, `Cyl`, `Sph` reduce JSX noise within the file |
| Color palette | Single `C` object keeps colors consistent and easy to swap |
| Encapsulation | `App.jsx` only knows `<Human position rotation />` — internals are hidden |
