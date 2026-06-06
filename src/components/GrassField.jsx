/**
 * GrassField.jsx — Phase 6.4: Wind Vertex Shader + Instanced Rendering
 *
 * Combines two Phase 6 techniques:
 *   - 6.3: Instanced rendering (2,000 grass blades in 1 draw call)
 *   - 6.4: Custom vertex shader (GPU-side wind displacement)
 *
 * ── Why Vertex Shader for Grass? ─────────────────────────────────────────────
 *
 * In InstancedForest.jsx, wind sway is done CPU-side: JS updates instance
 * matrices every frame. This works for 50 trees but doesn't scale to thousands.
 *
 * 2,000 blades × 1 matrix update per frame = 2,000 setMatrixAt() calls.
 * That's significant CPU work, plus 2,000 matrix uploads to the GPU.
 *
 * The vertex shader approach moves the animation completely to the GPU:
 * - Matrices are set ONCE (no per-frame updates)
 * - The GLSL vertex shader displaces each vertex based on worldPos + time
 * - All 2,000 blades × ~8 vertices each = 16,000 vertices processed in parallel
 *
 * This scales to 100,000 grass blades with no additional CPU cost.
 *
 * ── Blade Geometry ───────────────────────────────────────────────────────────
 *
 * Each blade is a PlaneGeometry(0.04, 0.5) — a thin vertical quad, 4cm wide,
 * 50cm tall, with 1 horizontal subdivision and 4 vertical segments.
 *
 * The extra vertical segments are what make bending work — if the blade were
 * a single quad (just 4 vertices), it would translate rigidly, not bend.
 * With 4 vertical segments = 10 vertices, the upper vertices sway more
 * (higher uv.y × sway = larger displacement) while the base stays planted.
 *
 * ── Wind Field ────────────────────────────────────────────────────────────────
 *
 * The vertex shader computes wind displacement from the blade's WORLD position
 * (extracted from the instance matrix via modelMatrix × vertex position).
 * This means blades at the same world X coordinate sway together — they're all
 * in the same "column" of the wind field — creating the wave effect of real wind.
 *
 * ── The Instance Matrix Setup ────────────────────────────────────────────────
 *
 * Each instance matrix encodes position + rotation + scale.
 * We give each blade a random Y rotation (so blades face different directions)
 * and a slight scale variation (grass height varies naturally).
 *
 * The wind shader displacement happens in LOCAL space but uses WORLD position
 * for the phase — so two blades at the same world X sway in sync even if they
 * have different rotations in their instance matrices.
 *
 * ── Performance Notes ─────────────────────────────────────────────────────────
 *
 * 2,000 blades × ~10 vertices = 20,000 vertices per frame.
 * Vertex shaders run in parallel on the GPU — 20,000 vertices costs roughly
 * the same time as 20 vertices for a modern GPU.
 * One draw call (instancing). No CPU work per frame.
 *
 * For truly dense grass fields (millions of blades), you'd also want:
 * - Frustum culling per instance cluster
 * - LOD: replace distant blades with flat ground texture
 * - Alpha dithering: blend to transparent at view distance
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { grassVertexShader, grassFragmentShader } from '../shaders/shaders'
import { getTerrainHeight } from '../systems/terrain'

// ── Grass placement zones ────────────────────────────────────────────────────
// Grass fills the open areas between buildings and trees.
// Kept away from spawn area (radius < 8) to avoid visual clutter at start.

const BLADE_COUNT = 2000

// ── Grass material ────────────────────────────────────────────────────────────

function useGrassMaterial() {
  return useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   grassVertexShader,
    fragmentShader: grassFragmentShader,
    uniforms: {
      uTime:          { value: 0 },
      uWindStrength:  { value: 0.07 },    // max sway in world units
      uWindFrequency: { value: 0.8 },     // spatial frequency of wind waves
      uBaseColor:     { value: new THREE.Color('#3a6230') },  // dark olive green
      uTipColor:      { value: new THREE.Color('#8db870') },  // light yellow-green
    },
    side:        THREE.DoubleSide,    // visible from front and back
    transparent: true,
    depthWrite:  false,               // prevents z-fighting with ground
    alphaTest:   0.1,                 // discard near-transparent fragments
  }), [])
}

// ── GrassField ────────────────────────────────────────────────────────────────

export default function GrassField() {
  const meshRef  = useRef()
  const material = useGrassMaterial()

  // Generate random blade positions
  const bladeData = useMemo(() => {
    const data = []
    let attempts = 0

    while (data.length < BLADE_COUNT && attempts < BLADE_COUNT * 5) {
      attempts++

      // Random XZ in a 100×100 area centered on mid-world
      const x = (Math.random() - 0.5) * 100
      const z = -5 - Math.random() * 100   // start 5 units in front of spawn

      // Skip spawn area (flat zone near origin — grass would clip through flat ground)
      const distFromOrigin = Math.sqrt(x * x + z * z)
      if (distFromOrigin < 12) continue

      const y     = getTerrainHeight(x, z)
      const rotY  = Math.random() * Math.PI * 2
      const scale = 0.7 + Math.random() * 0.6   // height variation

      data.push({ x, y, z, rotY, scale })
    }

    return data
  }, [])

  // ── Set instance matrices once ────────────────────────────────────────────
  // No per-frame update — the vertex shader handles all animation.
  useEffect(() => {
    if (!meshRef.current) return

    const dummy = new THREE.Object3D()

    bladeData.forEach(({ x, y, z, rotY, scale }, i) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, rotY, 0)
      dummy.scale.set(1, scale, 1)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })

    meshRef.current.instanceMatrix.needsUpdate = true
  }, [bladeData])

  // ── Advance uTime uniform each frame ──────────────────────────────────────
  // This is the ONLY per-frame work on the CPU side — one uniform write.
  // The vertex shader does the rest on the GPU.
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    /*
      InstancedMesh: same geometry, same shader material, 2000 instances.
      The vertex shader reads gl_InstanceID implicitly via the instance matrix —
      since the wind uses worldPos (derived from modelMatrix × position), each
      blade at a unique world location gets a unique wind phase.
    */
    <instancedMesh
      ref={meshRef}
      args={[null, null, BLADE_COUNT]}
      frustumCulled={false}  // disable for now — individual instance culling would need custom work
    >
      {/*
        PlaneGeometry: width=0.04 (4cm), height=0.5 (50cm)
        1 width segment (blade doesn't need horizontal subdivision)
        4 height segments (needed for the bend animation to look curved)
        → (1+1) × (4+1) = 10 vertices per blade
      */}
      <planeGeometry args={[0.04, 0.5, 1, 4]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}
