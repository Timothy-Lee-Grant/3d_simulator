/**
 * InstancedRocks.jsx — Phase 6.3: Instanced Rendering
 *
 * Renders 30 boulders in 1 draw call using THREE.InstancedMesh.
 * Previous Rocks.jsx: 5 rocks × 1 mesh = 5 draw calls.
 * InstancedRocks: 30 rocks = 1 draw call.
 *
 * ── Instance Matrix Math ─────────────────────────────────────────────────────
 *
 * Each rock gets a random:
 *   - XZ position (spread across the terrain)
 *   - Y rotation (faces a different direction)
 *   - Non-uniform scale (rocks are rarely perfect spheres)
 *   - Y position (snapped to terrain height)
 *
 * The non-uniform scale is the key difference from InstancedForest:
 *   dummy.scale.set(sx, sy, sz)  // each axis different
 *
 * This makes spheres look like actual boulders — flattened on one axis,
 * elongated on another. It's cheap: just different scale values per instance.
 *
 * ── Static vs Dynamic Instances ──────────────────────────────────────────────
 *
 * Rocks don't move, so matrices are set once in useEffect and never updated.
 * instanceMatrix.needsUpdate only needs to be true once after the initial write.
 * Contrast with InstancedForest's canopies, which set needsUpdate every frame.
 *
 * ── The instanceMatrix buffer ─────────────────────────────────────────────────
 *
 * instanceMatrix is a THREE.InstancedBufferAttribute — a Float32Array on the GPU.
 * Each matrix occupies 16 floats (a 4×4 matrix). For 30 rocks:
 *   30 × 16 × 4 bytes = 1,920 bytes — negligible GPU memory.
 *
 * For comparison, a single 512×512 RGBA texture is 1,048,576 bytes.
 * Instance matrices are extremely memory-efficient.
 */

import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'
import { getTerrainHeight } from '../systems/terrain'

// ── Rock placement data ───────────────────────────────────────────────────────

const ROCK_POSITIONS = [
  // Original 5
  [3,  -5], [-6, -9], [8, -20], [-12, -15], [18, -28],
  // Extended — rocks cluster naturally so group some together
  [4,  -7], [-7, -11],    // cluster near original
  [22, -5], [24,  -8],    // roadside cluster
  [-18,-10], [-20,-14],   // left-side cluster
  [10, -32], [12, -35], [9, -38],  // deep field
  [-8, -42], [-12,-45],   // left deep
  [30, -18], [28, -22],   // far right
  [-28,-25], [-30,-30],   // far left
  [16, -50], [-16, -55],  // very far
  [35, -35], [-35, -40],  // extreme edges
  [5,  -65], [-5, -68],   // distant
  [25, -72], [-25,-75],   // mountain foothills feel
  [40, -48], [-42, -50],  // flanking
  [2,  -90], [-2, -88],   // very distant markers
]

const COUNT = ROCK_POSITIONS.length

// ── Material ──────────────────────────────────────────────────────────────────

function useRockMaterial() {
  return useMemo(() => {
    const { albedo, normal, roughness } = getTexture('stone')

    const mat = new THREE.MeshStandardMaterial({
      map:       albedo,
      roughness: 1.0,  // roughnessMap drives the value; base = 1.0 × mapGreen
      metalness: 0,
    })
    if (roughness) {
      mat.roughnessMap = roughness
    }
    if (normal) {
      mat.normalMap   = normal
      mat.normalScale = new THREE.Vector2(0.8, 0.8)
    }

    return mat
  }, [])
}

// ── InstancedRocks ────────────────────────────────────────────────────────────

export default function InstancedRocks() {
  const meshRef = useRef()
  const mat     = useRockMaterial()

  // Pre-compute per-rock random transforms
  const rockData = useMemo(() => ROCK_POSITIONS.map(([x, z]) => {
    const y     = getTerrainHeight(x, z)
    const rotY  = Math.random() * Math.PI * 2
    const rotZ  = (Math.random() - 0.5) * 0.4    // slight tilt
    const sx    = 0.28 + Math.random() * 0.40     // width  (varied)
    const sy    = 0.18 + Math.random() * 0.28     // height (rocks are flatter than wide)
    const sz    = 0.24 + Math.random() * 0.38     // depth
    return { x, y, z, rotY, rotZ, sx, sy, sz }
  }), [])

  // ── Set instance matrices once ────────────────────────────────────────────
  useEffect(() => {
    if (!meshRef.current) return

    const dummy = new THREE.Object3D()

    rockData.forEach(({ x, y, z, rotY, rotZ, sx, sy, sz }, i) => {
      // Embed slightly into terrain — rocks don't float
      dummy.position.set(x, y + sy * 0.5 - 0.05, z)
      dummy.rotation.set(0, rotY, rotZ)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)

      // Stone color variation: lighter/darker per boulder
      const shade = 0.70 + Math.random() * 0.35
      meshRef.current.setColorAt(i, new THREE.Color(shade, shade * 0.97, shade * 0.93))
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true
  }, [rockData])

  return (
    // One draw call for all COUNT rocks
    <instancedMesh ref={meshRef} args={[null, null, COUNT]} castShadow receiveShadow>
      {/*
        SphereGeometry works well for boulders because non-uniform scaling
        (sx ≠ sy ≠ sz per instance) produces convincing irregular shapes.
        A perfect sphere with scale(1,0.5,1.3) looks like a flat riverstone.
      */}
      <sphereGeometry args={[1, 9, 7]} />
      <primitive object={mat} attach="material" />
    </instancedMesh>
  )
}
