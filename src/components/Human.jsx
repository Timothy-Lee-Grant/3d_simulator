/**
 * Human.jsx — Phase 6.2: Skeletal Animation State Machine
 *
 * Extends the procedural idle animation (Phase 2.3) with a full walk cycle
 * and a proper blend-based state machine (see AnimationStateMachine.js).
 *
 * ── Two-State Animation System ───────────────────────────────────────────────
 *
 * The human now supports two animation states:
 *
 *   IDLE  — slow breathing, weight shift, head scan (unchanged from Phase 2.3)
 *   WALK  — bipedal gait cycle: leg swing, arm counterswing, slight lean
 *
 * Switching states doesn't snap — the AnimationStateMachine returns blend weights
 * for both states simultaneously during the transition. Every animated parameter
 * is a weighted sum:
 *
 *   armRotation = idleWeight × idleArm + walkWeight × walkArm
 *
 * At the start of a transition, idleWeight=1, walkWeight=0.
 * Over 250ms, idleWeight→0, walkWeight→1.
 * The limbs flow smoothly into the new pose.
 *
 * ── Walk Cycle Math ──────────────────────────────────────────────────────────
 *
 * A human gait has a ~0.8–1.1 Hz stride frequency (steps per second).
 * Each stride = two steps (left and right foot). So the leg swing period
 * is half the stride period:
 *
 *   stepFreq = 1.8 Hz  → leg swing ω = 2π × 1.8 ≈ 11.3 rad/s
 *
 * Left and right legs are 180° out of phase (π offset).
 * Arms swing opposite to legs — right arm swings forward when right leg goes back.
 * This is the natural counterbalancing motion of bipedal walking.
 *
 * The torso leans slightly forward during walking — about 5°.
 *
 * ── Shoulder Pivot ───────────────────────────────────────────────────────────
 *
 * Arm groups have their origin at the SHOULDER JOINT (y=1.27), so rotating
 * the group around X pivots the arm at the shoulder — not the ground.
 * This was set up in Phase 2.3 and carries over unchanged.
 *
 * ── Phase Offset ─────────────────────────────────────────────────────────────
 *
 * The `phaseOffset` prop shifts each NPC's time input so all three characters
 * are never at the same point in their animation cycles simultaneously.
 * Without it they'd all step in unison — obviously robotic.
 *
 * ── Anatomy reference ────────────────────────────────────────────────────────
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
import { AnimationStateMachine, ANIM } from '../systems/AnimationStateMachine'

// ── Animation frequencies (ω in rad/s) ───────────────────────────────────────
const BREATH       = 2.83   // 0.45 Hz — breathing
const SWAY         = 1.88   // 0.30 Hz — idle arm sway
const SHIFT        = 0.75   // 0.12 Hz — weight shift lean
const LOOK         = 1.07   // 0.17 Hz — head yaw scan
const NOD          = 1.45   // 0.23 Hz — head nod
const STEP         = 11.3   // 1.80 Hz — walk leg swing (stride frequency × 2)
const WALK_LEAN    = 0.088  // forward lean during walk (radians ≈ 5°)

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  skin:  '#D4956A',
  hair:  '#2E1A0E',
  shirt: '#4A6FA5',
  pants: '#2C3E50',
  shoe:  '#1C1810',
  eye:   '#1A1A2E',
  mouth: '#A0604A',
}

// ── Primitive helpers ─────────────────────────────────────────────────────────

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

// ── Body regions ──────────────────────────────────────────────────────────────

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
 * Leg — now accepts a groupRef for the walk animation.
 * The group origin is at the HIP JOINT so rotation pivots the whole leg there.
 *
 * Hip joint world positions:
 *   left:  [-0.095, 0.68, 0]
 *   right: [ 0.095, 0.68, 0]
 *
 * All geometry is positioned relative to the hip origin:
 *   new_local = world_pos - hip_pos
 *   e.g. upper thigh at world [x, 0.51, 0], hip at [x, 0.68, 0]
 *        → local [0, -0.17, 0]
 */
function Leg({ side, groupRef }) {
  const x = side === 'left' ? -0.095 : 0.095
  return (
    <group ref={groupRef} name={`leg-${side}`} position={[x, 0.68, 0]}>
      {/* Upper thigh */}
      <Cyl args={[0.068, 0.062, 0.30, 8]} position={[0, -0.17, 0]} color={C.pants} />
      {/* Knee */}
      <Sph radius={0.062} position={[0, -0.33, 0.01]} color={C.pants} />
      {/* Lower leg */}
      <Cyl args={[0.055, 0.048, 0.28, 8]} position={[0, -0.51, 0]} color={C.pants} />
      {/* Ankle */}
      <Sph radius={0.048} position={[0, -0.68, 0.0]} color={C.skin} />
      {/* Shoe */}
      <Box size={[0.11, 0.07, 0.20]} position={[0, -0.70, 0.03]} color={C.shoe} />
    </group>
  )
}

function Arm({ side, groupRef }) {
  const xPivot = side === 'left' ? -0.215 :  0.215
  const thumbX = side === 'left' ?  0.055 : -0.055

  return (
    <group ref={groupRef} name={`arm-${side}`} position={[xPivot, 1.27, 0]}>
      <Sph radius={0.068} position={[0, 0, 0]}        color={C.shirt} />
      <Cyl args={[0.055, 0.048, 0.30, 8]} position={[0, -0.17, 0]} color={C.skin} />
      <Sph radius={0.048} position={[0, -0.33, 0]}    color={C.skin} />
      <Cyl args={[0.044, 0.038, 0.28, 8]} position={[0, -0.49, 0]} color={C.skin} />
      <Box size={[0.085, 0.095, 0.055]} position={[0, -0.67, 0.01]} color={C.skin} />
      <Box size={[0.025, 0.055, 0.025]} position={[thumbX, -0.65, 0.025]} color={C.skin} />
    </group>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

/**
 * @param {[number,number,number]} position       World position
 * @param {[number,number,number]} rotation       World rotation (Euler, radians)
 * @param {number}                 phaseOffset    Time offset — differentiates instances
 * @param {string}                 animationState One of ANIM.IDLE / ANIM.WALK / ANIM.RUN
 */
export default function Human({
  position    = [0, 0, 0],
  rotation    = [0, 0, 0],
  phaseOffset = 0,
  animationState = ANIM.IDLE,
}) {
  // ── Body part refs ──────────────────────────────────────────────────────
  const bodyRef  = useRef()   // whole-body root — breathing + lean
  const torsoRef = useRef()   // chest scale (breathing expansion)
  const headRef  = useRef()   // head look + nod
  const armLRef  = useRef()   // left arm
  const armRRef  = useRef()   // right arm
  const legLRef  = useRef()   // left leg
  const legRRef  = useRef()   // right leg

  // ── Animation state machine ─────────────────────────────────────────────
  // Stored in a ref — no re-renders from state changes, pure mutation in useFrame
  const fsm = useRef(new AnimationStateMachine(animationState))

  // Sync external animationState prop changes into the FSM
  // useEffect would add a one-frame delay — cheaper to read it in useFrame below

  useFrame((_, delta) => {
    // Sync prop → FSM (check cheaply every frame)
    if (fsm.current.dominantState !== animationState &&
        fsm.current.current !== animationState) {
      fsm.current.setState(animationState)
    }

    // Advance blend weight toward 1.0
    fsm.current.update(delta)

    const idleW = fsm.current.getWeight(ANIM.IDLE)
    const walkW = fsm.current.getWeight(ANIM.WALK)

    const t = performance.now() * 0.001 + phaseOffset  // time in seconds

    // ── Pre-compute waves ──────────────────────────────────────────────
    const breathe = Math.sin(t * BREATH)
    const sway    = Math.sin(t * SWAY)
    const shift   = Math.sin(t * SHIFT)
    const look    = Math.sin(t * LOOK)
    const nod     = Math.sin(t * NOD)

    // Walk: step cycle (left and right legs, 180° out of phase)
    const stepL   = Math.sin(t * STEP)          // left leg
    const stepR   = Math.sin(t * STEP + Math.PI) // right leg (opposite)

    // ── Whole body ─────────────────────────────────────────────────────
    if (bodyRef.current) {
      // Breathing rise: only in idle
      bodyRef.current.position.y = idleW * breathe * 0.004
      // Weight shift lean: idle only
      bodyRef.current.rotation.z = idleW * shift * 0.011
      // Forward lean while walking
      bodyRef.current.rotation.x = walkW * WALK_LEAN
    }

    // ── Torso: chest expansion ─────────────────────────────────────────
    if (torsoRef.current) {
      const expansion = idleW * breathe
      torsoRef.current.scale.x = 1 + expansion * 0.005
      torsoRef.current.scale.y = 1 + expansion * 0.010
    }

    // ── Arms ──────────────────────────────────────────────────────────
    // Idle: slow pendulum sway (opposite phase)
    // Walk: larger counterswing matching leg step cycle
    if (armLRef.current) {
      armLRef.current.rotation.x =
        idleW * ( sway * 0.055) +
        walkW * (-stepR * 0.38)  // left arm swings opposite to left leg (= with right leg)
    }
    if (armRRef.current) {
      armRRef.current.rotation.x =
        idleW * (-sway * 0.055) +
        walkW * (-stepL * 0.38)  // right arm swings opposite to right leg
    }

    // ── Legs ──────────────────────────────────────────────────────────
    // Legs are static in idle; swing forward/back in walk
    if (legLRef.current) {
      legLRef.current.rotation.x = walkW * stepL * 0.45
    }
    if (legRRef.current) {
      legRRef.current.rotation.x = walkW * stepR * 0.45
    }

    // ── Head ─────────────────────────────────────────────────────────
    // Idle: slow scan + nod. Walk: slight bobs with step (reduced)
    if (headRef.current) {
      headRef.current.rotation.y = idleW * look * 0.065
      headRef.current.rotation.x =
        idleW * nod * 0.022 +
        walkW * (stepL + stepR) * 0.5 * 0.018   // gentle bob on each step
    }
  })

  return (
    <group position={position} rotation={rotation}>
      <group ref={bodyRef} name="human">
        <Head  groupRef={headRef}  />
        <Torso groupRef={torsoRef} />
        <Hips />
        <Arm side="left"  groupRef={armLRef} />
        <Arm side="right" groupRef={armRRef} />
        <Leg side="left"  groupRef={legLRef} />
        <Leg side="right" groupRef={legRRef} />
      </group>
    </group>
  )
}
