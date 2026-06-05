import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * StreetLamps — metal lamp posts with emissive heads and point lights.
 *
 * This component exists primarily to demonstrate the metalness/roughness
 * workflow in PBR materials. Without an environment map, metalness looks
 * flat and unconvincing. With an environment map (added in App.jsx), the
 * metal surfaces reflect the sky and surroundings — giving the immediate
 * visual feedback that shows what PBR is actually doing.
 *
 * ── The metalness workflow ────────────────────────────────────────────────
 *
 * Real-world materials split into two categories:
 *   - Non-metals (dielectrics): wood, stone, concrete, skin, plastic
 *     metalness = 0
 *     specular is always the same grey-white tint (~4% reflectance at normal)
 *
 *   - Metals (conductors): iron, steel, aluminium, copper, gold
 *     metalness = 1
 *     specular takes the albedo colour (copper reflects orange, gold reflects yellow)
 *     diffuse is nearly zero (metals absorb rather than scatter light)
 *
 * The lamp posts here are dark painted iron:
 *   metalness = 0.85  (mostly metal, slight coating reduces it from 1.0)
 *   roughness = 0.35  (painted surface: smoother than bare iron, not mirror-smooth)
 *   color = #1a1a1a   (very dark — metals diffuse almost nothing, colour shows in spec)
 *
 * ── Point lights ─────────────────────────────────────────────────────────
 *
 * Each lamp head emits a warm point light. Point lights in Three.js follow
 * the inverse-square law for decay: intensity falls off as 1/distance².
 * The `distance` property sets the range beyond which intensity is zero.
 * `decay = 2` is physically correct (matches real photometric falloff).
 *
 * With 8 lamps in the scene, some objects may be within range of 2-3
 * point lights simultaneously. Three.js's default shader supports multiple
 * lights per object — you may see a limit around 4 affecting any single
 * mesh if they overlap significantly.
 */

// ── Lamp positions in the scene ───────────────────────────────────────────

const LAMP_POSITIONS = [
  [  2,  -8 ],
  [ -3, -11 ],
  [  8, -15 ],
  [ -8, -19 ],
  [  4, -24 ],
  [-12, -28 ],
  [ 11, -18 ],
  [ -1, -33 ],
]

// ── Shared materials — created once, shared across all lamp instances ─────

function useLampMaterials() {
  return useMemo(() => {
    // Dark painted metal pole
    const poleMat = new THREE.MeshStandardMaterial({
      color:     new THREE.Color('#1c1c1c'),
      metalness: 0.85,
      roughness: 0.35,
    })

    // Slightly lighter metal for the lamp housing
    const housingMat = new THREE.MeshStandardMaterial({
      color:     new THREE.Color('#252520'),
      metalness: 0.80,
      roughness: 0.45,
    })

    // Bright emissive glow sphere — not a real light source, just a visual
    // representation of the bulb. The actual illumination comes from pointLight.
    const bulbMat = new THREE.MeshStandardMaterial({
      color:        '#fff8e8',
      emissive:     new THREE.Color('#ffcc55'),
      emissiveIntensity: 4.0,
      roughness:    0.1,
      metalness:    0,
    })

    return { poleMat, housingMat, bulbMat }
  }, [])
}

// ── Single lamp post ──────────────────────────────────────────────────────

function StreetLamp({ position: [x, z], poleMat, housingMat, bulbMat }) {
  return (
    <group position={[x, 0, z]}>

      {/* ── Vertical pole ──────────────────────────────────────────── */}
      {/* Tapers slightly — wider at base for stability, narrower at top */}
      <mesh position={[0, 1.55, 0]} castShadow material={poleMat}>
        <cylinderGeometry args={[0.048, 0.072, 3.1, 10]} />
      </mesh>

      {/* ── Horizontal arm ─────────────────────────────────────────── */}
      {/* Rotated 90° around Z to lie along X axis */}
      <mesh
        position={[0.42, 3.14, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={poleMat}
      >
        <cylinderGeometry args={[0.030, 0.030, 0.88, 8]} />
      </mesh>

      {/* ── Lamp housing (cylindrical shade) ───────────────────────── */}
      <mesh position={[0.86, 3.08, 0]} castShadow material={housingMat}>
        <cylinderGeometry args={[0.115, 0.088, 0.24, 10]} />
      </mesh>

      {/* ── Top cap on housing ─────────────────────────────────────── */}
      <mesh position={[0.86, 3.21, 0]} material={housingMat}>
        <cylinderGeometry args={[0.12, 0.12, 0.035, 10]} />
      </mesh>

      {/* ── Emissive bulb sphere ────────────────────────────────────── */}
      {/* Slightly below the housing center — visible through the open bottom */}
      <mesh position={[0.86, 2.98, 0]} material={bulbMat}>
        <sphereGeometry args={[0.072, 8, 6]} />
      </mesh>

      {/* ── Point light ─────────────────────────────────────────────── */}
      {/* This is the actual light that illuminates the scene around the lamp */}
      <pointLight
        position={[0.86, 2.90, 0]}
        color="#ffd57a"
        intensity={12}
        distance={14}
        decay={2}
        castShadow={false}   // point light shadows are expensive — skip for lamps
      />

    </group>
  )
}

// ── StreetLamps group ─────────────────────────────────────────────────────

export default function StreetLamps() {
  const { poleMat, housingMat, bulbMat } = useLampMaterials()

  return (
    <group name="streetLamps">
      {LAMP_POSITIONS.map(([x, z], i) => (
        <StreetLamp
          key={i}
          position={[x, z]}
          poleMat={poleMat}
          housingMat={housingMat}
          bulbMat={bulbMat}
        />
      ))}
    </group>
  )
}
