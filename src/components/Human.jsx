/**
 * Human.jsx
 *
 * A standing humanoid figure built entirely from Three.js primitives —
 * no external model file required. This is a useful proof-of-concept:
 * it demonstrates the scene graph hierarchy of a character, establishes
 * correct proportions, and can later be replaced by a real GLTF model
 * by swapping just this file.
 *
 * Anatomy (all measurements in Three.js units, y=0 is ground level):
 *
 *   1.72 ── top of hair
 *   1.60 ── top of head
 *   1.36 ── chin / base of head
 *   1.26 ── shoulder
 *   0.92 ── elbow
 *   0.88 ── waist / hip top
 *   0.68 ── hip bottom / top of thigh
 *   0.62 ── hand / wrist
 *   0.44 ── knee
 *   0.10 ── ankle
 *   0.00 ── ground
 *
 * Each body region is a named <group> so you can later attach
 * animations, IK targets, or physics constraints to individual bones.
 */

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  skin:    '#D4956A',
  hair:    '#2E1A0E',
  shirt:   '#4A6FA5',
  pants:   '#2C3E50',
  shoe:    '#1C1810',
  eye:     '#1A1A2E',
  mouth:   '#A0604A',
}

// ── Shared material shorthand ──────────────────────────────────────────────
function Mat({ color }) {
  return <meshLambertMaterial color={color} />
}

// ── Body-part building blocks ──────────────────────────────────────────────

function Box({ size, position, color, rotation }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Mat color={color} />
    </mesh>
  )
}

function Cyl({ args, position, rotation, color }) {
  // CylinderGeometry args: [radiusTop, radiusBottom, height, radialSegments]
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

// ── Sub-components by region ───────────────────────────────────────────────

function Head() {
  return (
    <group name="head" position={[0, 1.47, 0]}>
      {/* Skull */}
      <Box size={[0.24, 0.26, 0.24]} position={[0, 0, 0]} color={C.skin} />

      {/* Hair — slightly oversized box sitting on top */}
      <Box size={[0.255, 0.10, 0.255]} position={[0, 0.16, 0]} color={C.hair} />
      {/* Hair sides and back */}
      <Box size={[0.04,  0.22, 0.255]} position={[-0.145, 0.02, 0]} color={C.hair} />
      <Box size={[0.04,  0.22, 0.255]} position={[ 0.145, 0.02, 0]} color={C.hair} />
      <Box size={[0.255, 0.22, 0.04]}  position={[0, 0.02, -0.145]} color={C.hair} />

      {/* Eyes — sit on the front face (positive Z side) */}
      <Box size={[0.045, 0.032, 0.025]} position={[-0.062, 0.02,  0.12]} color={C.eye} />
      <Box size={[0.045, 0.032, 0.025]} position={[ 0.062, 0.02,  0.12]} color={C.eye} />

      {/* Mouth */}
      <Box size={[0.07, 0.018, 0.02]} position={[0, -0.07, 0.12]} color={C.mouth} />

      {/* Ears */}
      <Box size={[0.025, 0.055, 0.025]} position={[-0.135, 0.0, 0.0]} color={C.skin} />
      <Box size={[0.025, 0.055, 0.025]} position={[ 0.135, 0.0, 0.0]} color={C.skin} />

      {/* Neck */}
      <Cyl
        args={[0.055, 0.06, 0.12, 8]}
        position={[0, -0.18, 0]}
        color={C.skin}
      />
    </group>
  )
}

function Torso() {
  return (
    <group name="torso" position={[0, 0, 0]}>
      {/* Upper torso / chest */}
      <Box
        size={[0.38, 0.26, 0.22]}
        position={[0, 1.15, 0]}
        color={C.shirt}
      />

      {/* Lower torso / abdomen — slightly narrower */}
      <Box
        size={[0.34, 0.20, 0.20]}
        position={[0, 0.91, 0]}
        color={C.shirt}
      />

      {/* Waistband */}
      <Box
        size={[0.36, 0.045, 0.22]}
        position={[0, 0.80, 0]}
        color={C.pants}
      />
    </group>
  )
}

function Hips() {
  return (
    <group name="hips" position={[0, 0, 0]}>
      <Box
        size={[0.34, 0.14, 0.21]}
        position={[0, 0.73, 0]}
        color={C.pants}
      />
    </group>
  )
}

function Leg({ side }) {
  const x = side === 'left' ? -0.095 : 0.095

  return (
    <group name={`leg-${side}`}>
      {/* Upper leg / thigh */}
      <Cyl
        args={[0.068, 0.062, 0.30, 8]}
        position={[x, 0.51, 0]}
        color={C.pants}
      />

      {/* Knee — small sphere for shape */}
      <Sph radius={0.062} position={[x, 0.35, 0.01]} color={C.pants} />

      {/* Lower leg / shin */}
      <Cyl
        args={[0.055, 0.048, 0.28, 8]}
        position={[x, 0.195, 0]}
        color={C.pants}
      />

      {/* Ankle */}
      <Sph radius={0.048} position={[x, 0.06, 0.0]} color={C.skin} />

      {/* Shoe / foot */}
      <Box
        size={[0.11, 0.07, 0.20]}
        position={[x, 0.035, 0.03]}
        color={C.shoe}
      />
    </group>
  )
}

function Arm({ side }) {
  // Arms hang straight down from the shoulder socket
  const x = side === 'left' ? -0.215 : 0.215

  return (
    <group name={`arm-${side}`}>
      {/* Shoulder cap */}
      <Sph radius={0.068} position={[x, 1.27, 0]} color={C.shirt} />

      {/* Upper arm */}
      <Cyl
        args={[0.055, 0.048, 0.30, 8]}
        position={[x, 1.10, 0]}
        color={C.skin}
      />

      {/* Elbow */}
      <Sph radius={0.048} position={[x, 0.94, 0]} color={C.skin} />

      {/* Lower arm / forearm */}
      <Cyl
        args={[0.044, 0.038, 0.28, 8]}
        position={[x, 0.78, 0]}
        color={C.skin}
      />

      {/* Hand */}
      <Box
        size={[0.085, 0.095, 0.055]}
        position={[x, 0.60, 0.01]}
        color={C.skin}
      />

      {/* Thumb */}
      <Box
        size={[0.025, 0.055, 0.025]}
        position={[x + (side === 'left' ? 0.055 : -0.055), 0.62, 0.025]}
        color={C.skin}
      />
    </group>
  )
}

// ── Root component ─────────────────────────────────────────────────────────

/**
 * @param {[number,number,number]} position  World position [x, y, z]
 * @param {[number,number,number]} rotation  Euler rotation [x, y, z] in radians
 */
export default function Human({ position = [0, 0, 0], rotation = [0, 0, 0] }) {
  return (
    <group name="human" position={position} rotation={rotation}>
      <Head />
      <Torso />
      <Hips />
      <Arm side="left"  />
      <Arm side="right" />
      <Leg side="left"  />
      <Leg side="right" />
    </group>
  )
}
