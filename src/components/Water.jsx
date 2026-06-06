import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * Water — animated lake using UV texture scrolling.
 *
 * ── Phase 4.4 ────────────────────────────────────────────────────────────
 *
 * Water is one of the most visually rewarding things to implement, and it
 * teaches a core GPU animation technique: UV SCROLLING.
 *
 * The geometry is completely static — a flat plane that never changes.
 * What moves is the texture's sample point. Every frame we advance
 * `texture.offset` by a small amount. Because the texture has RepeatWrapping,
 * the offset wraps around endlessly, creating perpetual motion from a
 * zero-geometry-cost operation.
 *
 * ── UV Coordinates and Texture.offset ────────────────────────────────────
 *
 * Every vertex in a mesh has a UV coordinate — a 2D point (u from 0→1
 * left-to-right, v from 0→1 bottom-to-top) that the GPU uses to sample
 * the texture. When the GPU computes pixel colour for a fragment, it
 * performs a texture lookup at the interpolated UV of that fragment.
 *
 * THREE.Texture.offset is a Vector2 that is ADDED to all UV coordinates
 * before sampling. If offset = (0.1, 0.0), every UV is shifted 10% to the
 * right, making the texture appear to have moved left.
 *
 * Incrementing offset each frame:
 *   offset.x += 0.03 * delta    → texture drifts left (east-flowing current)
 *   offset.y -= 0.015 * delta   → texture drifts up  (north-flowing current)
 *
 * Two independent texture layers scroll in different directions — the albedo
 * colour map drifts one way, the normal map drifts another. Their interference
 * pattern creates the look of disturbed surface water without any simulation.
 *
 * ── Why two separate texture clones? ──────────────────────────────────────
 *
 * A Three.js Texture is a GPU resource. If you mutate offset on a shared
 * texture, ALL meshes using that texture shift simultaneously. We clone()
 * the texture per water plane so each plane can scroll independently.
 * clone() is cheap — it creates a new JavaScript wrapper around the same
 * GPU memory (the pixel data is not copied).
 *
 * ── Normal map scrolling ──────────────────────────────────────────────────
 *
 * The normal map encodes surface micro-normals as RGB. When it scrolls,
 * the lighting calculation sees different normals each frame — the specular
 * highlight shifts, appears to ripple across the surface. Scrolling two
 * normal maps in perpendicular directions produces convincing wave interference
 * entirely in screen space, with no vertex simulation at all.
 *
 * ── Transparency ─────────────────────────────────────────────────────────
 *
 * Water is transparent: `transparent: true`, `opacity: 0.82`. Three.js
 * renders transparent objects in a separate pass, after all opaque objects,
 * sorted back-to-front so blending is correct. The water plane must be
 * positioned slightly above the terrain floor so it doesn't z-fight with
 * the ground mesh.
 *
 * ── Placement ────────────────────────────────────────────────────────────
 *
 * Water is placed at Y = -1.2 in a depression west of the settlement.
 * The terrain's noise function creates a low valley in this region —
 * verifiable by calling getTerrainHeight(-35, -45) which returns ~-1.5.
 * The water plane sits just above the terrain floor, filling the valley
 * like a natural lake.
 *
 * ── Future: MeshReflectorMaterial ────────────────────────────────────────
 *
 * Drei's `<MeshReflectorMaterial>` provides real-time screen-space
 * reflections with one component. This scrolling approach is the correct
 * learning foundation — understand UV scrolling before adding reflections.
 */

// Lake placements — [centerX, surfaceY, centerZ, width, depth]
const LAKES = [
  { position: [-35, -1.2, -45], size: [22, 28] },
  { position: [ 55,  -0.8, -60], size: [14, 18] },
]

// ── Per-lake water plane ──────────────────────────────────────────────────

function WaterPlane({ position, size }) {
  const meshRef    = useRef()
  const albedoRef  = useRef()
  const normalRef  = useRef()

  // Build per-plane material with independently cloned textures
  const material = useMemo(() => {
    const { albedo, normal } = getTexture('water')

    // Clone albedo — this plane owns its own UV offset state
    const albedoMap = albedo.clone()
    albedoMap.needsUpdate = true
    albedoMap.wrapS = albedoMap.wrapT = THREE.RepeatWrapping
    albedoMap.repeat.set(size[0] / 5, size[1] / 5)
    albedoRef.current = albedoMap

    const mat = new THREE.MeshStandardMaterial({
      map:         albedoMap,
      color:       new THREE.Color('#1a4a8a'),
      transparent: true,
      opacity:     0.82,
      roughness:   0.06,
      metalness:   0.08,
      side:        THREE.FrontSide,
      depthWrite:  false,   // prevents transparent surface from occluding geometry behind it
    })

    // Clone normal map — scrolls in a different direction from albedo
    if (normal) {
      const normalMap = normal.clone()
      normalMap.needsUpdate = true
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping
      normalMap.repeat.set(size[0] / 8, size[1] / 8)
      mat.normalMap = normalMap
      mat.normalScale.set(0.35, 0.35)
      normalRef.current = normalMap
    }

    return mat
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animate UV offsets every frame — no geometry changes, pure texture state
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Albedo: drift diagonally (current flowing south-east)
    if (albedoRef.current) {
      albedoRef.current.offset.set(t * 0.028, -t * 0.016)
    }

    // Normal map: drift perpendicular to albedo for interference pattern
    if (normalRef.current) {
      normalRef.current.offset.set(-t * 0.018, t * 0.022)
    }

    // Subtle opacity pulse — simulates light catching the surface
    if (meshRef.current?.material) {
      meshRef.current.material.opacity = 0.79 + Math.sin(t * 0.7) * 0.04
    }
  })

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={position}
      receiveShadow={false}   // transparent surfaces don't receive shadows well
      material={material}
    >
      <planeGeometry args={size} />
    </mesh>
  )
}

// ── Water group ────────────────────────────────────────────────────────────

export default function Water() {
  return (
    <group name="water">
      {LAKES.map((lake, i) => (
        <WaterPlane key={i} position={lake.position} size={lake.size} />
      ))}
    </group>
  )
}
