/**
 * Human.jsx
 *
 * A standing humanoid figure with procedural idle animation.
 * Every movement is driven by Math.sin() — no keyframes, no animation clips,
 * no external files. The animation system is layered on top of the existing
 * primitive-geometry skeleton using React refs and R3F's useFrame hook.
 *
 * ── Animation Architecture ────────────────────────────────────────────────
 *
 * The component has two nested groups at its root:
 *
 *   <group position={position} rotation={rotation}>   ← world-space group
 *     <group ref={bodyRef}>                           ← animation target
 *       <Head /> <Torso /> <Arms /> <Legs />
 *     </group>
 *   </group>
 *
 * The outer group is React-controlled: position and rotation come from props
 * and React reconciles them. The inner bodyRef group has no React-controlled
 * props, so useFrame can mutate its transform freely without React fighting it.
 *
 * ── Shoulder Pivot ────────────────────────────────────────────────────────
 *
 * The Arm component was restructured so that the group's origin is at the
 * shoulder joint. All geometry is then positioned RELATIVE to that origin.
 * When useFrame sets armRef.rotation.x, the arm rotates around the shoulder —
 * not around y=0 (the ground), which would have been wrong.
 *
 * ── Phase Offset ─────────────────────────────────────────────────────────
 *
 * All three humans in the scene share the same component code. Without a
 * phase offset, they'd all breathe, sway, and look around in perfect
 * synchrony — obviously machine-like. The `phaseOffset` prop shifts each
 * human's time input, so they're always at different points in their cycles.
 *
 * ── Anatomy ──────────────────────────────────────────────────────────────
 *
 *   1.72 ── top of hair
 *   1.60 ── top of head
 *   1.36 ── chin
 *   1.27 ── shoulder pivot  ← arm group origin
 *   0.92 ── elbow
 *   0.88 ── waist
 *   0.68 ── hip bottom
 *   0.60 ── hand
 *   0.44 ── knee
 *   0.10 ── ankle
 *   0.00 ── ground
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// ── Animation frequencies (ω = 2π × Hz, in rad/s) ────────────────────────
//
//  0.45 Hz → ω = 2.83  → period 2.2 s  (breathing)
//  0.30 Hz → ω = 1.88  → period 3.3 s  (arm sway)
//  0.12 Hz → ω = 0.75  → period 8.4 s  (weight shift)
//  0.17 Hz → ω = 1.07  → period 5.9 s  (head look)
//  0.23 Hz → ω = 1.45  → period 4.3 s  (head nod, different from look)
const BREATH = 2.83
const SWAY   = 1.88
const SHIFT  = 0.75
const LOOK   = 1.07
const NOD    = 1.45

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  skin:  '#D4956A',
  hair:  '#2E1A0E',
  shirt: '#4A6FA5',
  pants: '#2C3E50',
  shoe:  '#1C1810',
  eye:   '#1A1A2E',
  mouth: '#A0604A',
}

// ── Primitive helpers ─────────────────────────────────────────────────────

function Mat({ color }) {
  return <meshLambertMaterial color={color} />
}

function Box({ size, position, color, rotation }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Mat color={color} />
    </mesh>
  )
}

function Cyl({ args, position, rotation, color }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <cylinderGeometry args={args} />
      <Mat color={color} />
    </mesh>
  )
}

function Sph({ radius, position, color }) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 12, 9]} />
      <Mat color={color} />
    </mesh>
  )
}

// ── Body regions ──────────────────────────────────────────────────────────

/**
 * Head — accepts a groupRef so the parent Human can rotate it.
 * The group is positioned at the head's center (y=1.47).
 * For small rotation angles (±0.065 rad ≈ ±3.7°), rotating around the
 * head center rather than the neck base is imperceptible.
 */
function Head({ groupRef }) {
  return (
    <group ref={groupRef} name="head" position={[0, 1.47, 0]}>
      <Box size={[0.24, 0.26, 0.24]}  position={[0, 0, 0]}          color={C.skin} />
      <Box size={[0.255, 0.10, 0.255]} position={[0, 0.16, 0]}       color={C.hair} />
      <Box size={[0.04, 0.22, 0.255]}  position={[-0.145, 0.02, 0]}  color={C.hair} />
      <Box size={[0.04, 0.22, 0.255]}  position={[ 0.145, 0.02, 0]}  color={C.hair} />
      <Box size={[0.255, 0.22, 0.04]}  position={[0, 0.02, -0.145]}  color={C.hair} />
      <Box size={[0.045, 0.032, 0.025]} position={[-0.062, 0.02, 0.12]} color={C.eye} />
      <Box size={[0.045, 0.032, 0.025]} position={[ 0.062, 0.02, 0.12]} color={C.eye} />
      <Box size={[0.07, 0.018, 0.02]}  position={[0, -0.07, 0.12]}  color={C.mouth} />
      <Box size={[0.025, 0.055, 0.025]} position={[-0.135, 0, 0]}    color={C.skin} />
      <Box size={[0.025, 0.055, 0.025]} position={[ 0.135, 0, 0]}    color={C.skin} />
      <Cyl args={[0.055, 0.06, 0.12, 8]} position={[0, -0.18, 0]}   color={C.skin} />
    </group>
  )
}

/**
 * Torso — accepts a groupRef so the parent can scale its Y (chest expansion).
 * The group is at the root origin (y=0), with geometry positioned absolutely
 * within it. Scaling torso.scale.y affects the chest and abdomen mesh heights.
 */
function Torso({ groupRef }) {
  return (
    <group ref={groupRef} name="torso">
      <Box size={[0.38, 0.26, 0.22]} position={[0, 1.15, 0]} color={C.shirt} />
      <Box size={[0.34, 0.20, 0.20]} position={[0, 0.91, 0]} color={C.shirt} />
      <Box size={[0.36, 0.045, 0.22]} position={[0, 0.80, 0]} color={C.pants} />
    </group>
  )
}

function Hips() {
  return (
    <group name="hips">
      <Box size={[0.34, 0.14, 0.21]} position={[0, 0.73, 0]} color={C.pants} />
    </group>
  )
}

/**
 * Leg — no animation for now. Legs remain static during the idle.
 * (Walking animation would require per-leg refs and a gait cycle.)
 */
function Leg({ side }) {
  const x = side === 'left' ? -0.095 : 0.095
  return (
    <group name={`leg-${side}`}>
      <Cyl args={[0.068, 0.062, 0.30, 8]} position={[x, 0.51, 0]} color={C.pants} />
      <Sph radius={0.062} position={[x, 0.35, 0.01]} color={C.pants} />
      <Cyl args={[0.055, 0.048, 0.28, 8]} position={[x, 0.195, 0]} color={C.pants} />
      <Sph radius={0.048} position={[x, 0.06, 0.0]} color={C.skin} />
      <Box size={[0.11, 0.07, 0.20]} position={[x, 0.035, 0.03]} color={C.shoe} />
    </group>
  )
}

/**
 * Arm — group origin sits at the SHOULDER JOINT (y=1.27, x=±0.215).
 * All geometry is positioned relative to that pivot so that rotating
 * the group around its X axis produces a correct shoulder-pivot swing —
 * not a rotation around the ground-level origin (y=0).
 *
 * Position math:  new_local = world_pos - shoulder_pivot
 *   e.g. upper arm was at world [x, 1.10, 0], pivot at [x, 1.27, 0]
 *        → local position [0, 1.10-1.27, 0] = [0, -0.17, 0]
 */
function Arm({ side, groupRef }) {
  const xPivot = side === 'left' ? -0.215 :  0.215
  const thumbX = side === 'left' ?  0.055 : -0.055   // thumb toward body midline

  return (
    <group ref={groupRef} name={`arm-${side}`} position={[xPivot, 1.27, 0]}>
      {/* Shoulder cap — at pivot origin */}
      <Sph radius={0.068} position={[0, 0, 0]}        color={C.shirt} />
      {/* Upper arm */}
      <Cyl args={[0.055, 0.048, 0.30, 8]} position={[0, -0.17, 0]} color={C.skin} />
      {/* Elbow */}
      <Sph radius={0.048} position={[0, -0.33, 0]}    color={C.skin} />
      {/* Forearm */}
      <Cyl args={[0.044, 0.038, 0.28, 8]} position={[0, -0.49, 0]} color={C.skin} />
      {/* Hand */}
      <Box size={[0.085, 0.095, 0.055]} position={[0, -0.67, 0.01]} color={C.skin} />
      {/* Thumb */}
      <Box size={[0.025, 0.055, 0.025]} position={[thumbX, -0.65, 0.025]} color={C.skin} />
    </group>
  )
}

// ── Root component ────────────────────────────────────────────────────────

/**
 * @param {[number,number,number]} position     World position
 * @param {[number,number,number]} rotation     World rotation (Euler, radians)
 * @param {number}                 phaseOffset  Time offset in seconds — differentiates
 *                                              this instance from others using the same component.
 *                                              Use values spread across [0, 2π/lowestFreq] ≈ [0, 8.4].
 */
export default function Human({ position = [0, 0, 0], rotation = [0, 0, 0], phaseOffset = 0 }) {
  // Animation refs — each drives one body region in useFrame
  const bodyRef  = useRef()   // whole-body breathing + weight shift
  const torsoRef = useRef()   // chest scale (expansion)
  const headRef  = useRef()   // head look + nod
  const armLRef  = useRef()   // left arm swing
  const armRRef  = useRef()   // right arm swing

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phaseOffset

    // ── Pre-compute the sine waves for this frame ─────────────────────
    // Each drives a different frequency of movement.
    const breathe = Math.sin(t * BREATH)   // -1…+1, 0.45 Hz
    const sway    = Math.sin(t * SWAY)     // -1…+1, 0.30 Hz
    const shift   = Math.sin(t * SHIFT)    // -1…+1, 0.12 Hz
    const look    = Math.sin(t * LOOK)     // -1…+1, 0.17 Hz
    const nod     = Math.sin(t * NOD)      // -1…+1, 0.23 Hz

    // ── Whole body: breathing rise + weight shift lean ────────────────
    // bodyRef has no React-controlled position props, so direct mutation
    // in useFrame is safe — React will never overwrite these.
    if (bodyRef.current) {
      bodyRef.current.position.y = breathe * 0.004   // ±4mm rise on inhale
      bodyRef.current.rotation.z = shift   * 0.011   // ±0.6° lean with weight shift
    }

    // ── Torso: chest expansion on each breath ─────────────────────────
    // scale.x and scale.y affect the chest and abdomen meshes together.
    // scale.z is kept at 1 to avoid visible depth change.
    if (torsoRef.current) {
      torsoRef.current.scale.x = 1 + breathe * 0.005   // ±0.5% width
      torsoRef.current.scale.y = 1 + breathe * 0.010   // ±1.0% height
    }

    // ── Arms: pendulum sway in opposite phase ─────────────────────────
    // When left arm swings forward (positive X rotation), right arm swings
    // back (negative X rotation) — the natural counterbalancing of idle standing.
    // Rotation is around the group's X axis, which pivots at the shoulder joint.
    if (armLRef.current) armLRef.current.rotation.x =  sway * 0.055   // ±3.2°
    if (armRRef.current) armRRef.current.rotation.x = -sway * 0.055

    // ── Head: slow scan + subtle nod ─────────────────────────────────
    // Two independent sine waves at different frequencies = the head
    // never repeats the same path, making the movement feel organic.
    if (headRef.current) {
      headRef.current.rotation.y = look * 0.065    // ±3.7° left/right scan
      headRef.current.rotation.x = nod  * 0.022   // ±1.3° nod
    }
  })

  return (
    // ── Outer group: static world transform (React-controlled) ────────
    <group position={position} rotation={rotation}>

      {/* ── Inner group: animation target (useFrame-controlled) ────── */}
      {/* No position/rotation props here — useFrame owns those transforms */}
      <group ref={bodyRef} name="human">
        <Head  groupRef={headRef}  />
        <Torso groupRef={torsoRef} />
        <Hips />
        <Arm side="left"  groupRef={armLRef} />
        <Arm side="right" groupRef={armRRef} />
        <Leg side="left"  />
        <Leg side="right" />
      </group>

    </group>
  )
}
