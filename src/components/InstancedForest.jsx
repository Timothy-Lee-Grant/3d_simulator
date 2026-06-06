/**
 * InstancedForest.jsx — Phase 6.3: Instanced Rendering
 *
 * Renders 50 trees in exactly 3 GPU draw calls using THREE.InstancedMesh.
 * The previous Trees.jsx rendered 8 trees × 3 meshes = 24 draw calls.
 * This version renders 50 trees × 3 mesh types = still only 3 draw calls.
 *
 * ── Why Draw Calls Matter ────────────────────────────────────────────────────
 *
 * A "draw call" is one command from the CPU telling the GPU to render a mesh.
 * Each draw call carries overhead: state validation, driver work, command buffer
 * recording. Modern GPUs can execute millions of triangles per millisecond — but
 * they can only process ~1,000–3,000 draw calls per frame before the CPU becomes
 * the bottleneck.
 *
 * A forest of 500 trees × 3 meshes = 1,500 draw calls — your entire frame budget,
 * just for trees. With instancing, the same 500 trees cost 3 draw calls.
 *
 * ── How InstancedMesh Works ──────────────────────────────────────────────────
 *
 * InstancedMesh(geometry, material, count) creates a single renderable that draws
 * `count` copies of `geometry` in one draw call. The GPU receives:
 *
 *   - 1 vertex buffer (the mesh shape)
 *   - 1 material (shader + textures)
 *   - N instance matrices packed as a Float32Array (position + rotation + scale per copy)
 *
 * Each matrix is a 4×4 transform matrix (THREE.Matrix4). To set it:
 *   1. Configure a dummy THREE.Object3D (position, rotation, scale)
 *   2. Call dummy.updateMatrix() to build the matrix
 *   3. Call instancedMesh.setMatrixAt(i, dummy.matrix)
 *   4. Set instancedMesh.instanceMatrix.needsUpdate = true
 *
 * After step 4, the new matrices are uploaded to the GPU on the next render.
 *
 * ── Per-Instance Color ───────────────────────────────────────────────────────
 *
 * instancedMesh.setColorAt(i, color) stores per-instance RGB tints.
 * The color is multiplied with the material's base color in the shader.
 * This lets each canopy be a slightly different shade of green without any
 * additional draw calls or materials.
 *
 * ── Wind Animation ───────────────────────────────────────────────────────────
 *
 * Canopy matrices are rebuilt each frame with a small rotation offset computed
 * from Math.sin(time + perTreePhase). This creates the illusion of wind-driven
 * sway. Each tree has a different phase offset so they don't all sway in unison.
 *
 * Cost: 50 setMatrixAt() calls per frame per canopy mesh = ~100 calls/frame.
 * This is negligible CPU work. For 10,000+ instances you'd move this to a shader.
 *
 * ── Material Sharing ─────────────────────────────────────────────────────────
 *
 * All trunk instances share one material. All canopy instances share another.
 * This is correct and efficient — the GPU only uploads the texture once.
 * Instancing requires identical geometry AND material per batch.
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'
import { getTerrainHeight } from '../systems/terrain'

// ── Tree placement data ───────────────────────────────────────────────────────
// 50 trees. Instancing makes more trees essentially free, so we triple the count.
const TREE_POSITIONS = [
  // Original 8 positions
  [ 4,  -6], [-7, -13], [12, -18], [-5, -28],
  [20,  -8], [-25,-18], [ 6, -35], [-14,-40],
  // Extended forest
  [30, -25], [-32, -20], [18, -45], [-22, -50],
  [ 8, -55], [-10, -60], [25, -15], [-30, -35],
  [35, -40], [-38, -45], [15, -70], [-20, -70],
  [40, -55], [-42, -30], [ 5, -75], [ -8, -80],
  [22, -60], [-28, -65], [32, -68], [-35, -58],
  [45, -20], [-45, -55], [10, -85], [-15, -90],
  [28, -80], [-32, -80], [38, -72], [-40, -70],
  [50, -30], [-50, -40], [20, -95], [-25,-100],
  [ 5,-100], [ -5,-105], [35, -90], [-38, -90],
  [48, -65], [-48, -60], [55, -50], [-55, -45],
  [15,-110], [-18,-110],
]

const COUNT = TREE_POSITIONS.length

// ── Materials ─────────────────────────────────────────────────────────────────

function useForestMaterials() {
  return useMemo(() => {
    // Bark material — shared across all trunk instances
    const { albedo: barkAlbedo, normal: barkNormal } = getTexture('bark')
    const barkMat = new THREE.MeshStandardMaterial({
      map:       barkAlbedo,
      roughness: 0.95,
      metalness: 0,
    })
    if (barkNormal) {
      barkMat.normalMap   = barkNormal
      barkMat.normalScale = new THREE.Vector2(0.6, 0.6)
    }

    // Leaf material — shared across all canopy instances
    const { albedo: leafAlbedo } = getTexture('leaves')
    const leafMat = new THREE.MeshStandardMaterial({
      map:       leafAlbedo,
      roughness: 0.90,
      metalness: 0,
    })

    return { barkMat, leafMat }
  }, [])
}

// ── InstancedForest ───────────────────────────────────────────────────────────

export default function InstancedForest() {
  const trunkRef   = useRef()
  const canopyRef  = useRef()
  const canopy2Ref = useRef()

  const { barkMat, leafMat } = useForestMaterials()

  // Per-tree data: position + per-instance random values for wind variation
  const treeData = useMemo(() => TREE_POSITIONS.map(([x, z]) => ({
    x,
    z,
    y:     getTerrainHeight(x, z),
    phase: Math.random() * Math.PI * 2,       // sway start phase
    speed: 0.40 + Math.random() * 0.30,       // sway frequency (rad/s)
    amp:   0.012 + Math.random() * 0.010,     // sway amplitude (radians)
    scale: 0.85 + Math.random() * 0.30,       // random size variation
  })), [])

  // ── Static trunk and canopy matrices (set once on mount) ──────────────────
  useEffect(() => {
    if (!trunkRef.current || !canopyRef.current || !canopy2Ref.current) return

    const dummy = new THREE.Object3D()

    treeData.forEach(({ x, y, z, scale }, i) => {
      // Trunk: positioned at ground, scaled uniformly
      dummy.position.set(x, y + 0.9 * scale, z)
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)  // random Y rotation
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      trunkRef.current.setMatrixAt(i, dummy.matrix)

      // Main canopy: initial position (will be overwritten each frame by wind)
      dummy.position.set(x, y + 2.2 * scale, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      canopyRef.current.setMatrixAt(i, dummy.matrix)

      // Secondary canopy: offset, smaller
      dummy.position.set(x + 0.4 * scale, y + 1.9 * scale, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(scale * 0.82, scale * 0.82, scale * 0.82)
      dummy.updateMatrix()
      canopy2Ref.current.setMatrixAt(i, dummy.matrix)

      // Per-instance color: slight green tint variation
      // Multiplied with material.map color in the shader
      const g    = 0.80 + Math.random() * 0.25
      const tint = new THREE.Color(g * 0.88, g, g * 0.78)
      canopyRef.current.setColorAt(i, tint)
      canopy2Ref.current.setColorAt(i, tint)
    })

    trunkRef.current.instanceMatrix.needsUpdate  = true
    canopyRef.current.instanceMatrix.needsUpdate = true
    canopy2Ref.current.instanceMatrix.needsUpdate = true

    if (canopyRef.current.instanceColor)
      canopyRef.current.instanceColor.needsUpdate = true
    if (canopy2Ref.current.instanceColor)
      canopy2Ref.current.instanceColor.needsUpdate = true
  }, [treeData])

  // ── Per-frame canopy wind sway ─────────────────────────────────────────────
  // Recompute canopy matrices each frame with a sine-based rotation offset.
  // Trunks are left static (they barely sway in real wind).
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    if (!canopyRef.current || !canopy2Ref.current) return

    const t = clock.getElapsedTime()

    treeData.forEach(({ x, y, z, phase, speed, amp, scale }, i) => {
      const sway = Math.sin(t * speed + phase) * amp

      // Main canopy: sway on X and Z axes
      dummy.position.set(x, y + 2.2 * scale, z)
      dummy.rotation.set(sway, 0, sway * 0.6)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      canopyRef.current.setMatrixAt(i, dummy.matrix)

      // Secondary canopy: opposite phase for natural countermovement
      dummy.position.set(x + 0.4 * scale, y + 1.9 * scale, z)
      dummy.rotation.set(-sway * 0.8, 0, sway * 0.5)
      dummy.scale.set(scale * 0.82, scale * 0.82, scale * 0.82)
      dummy.updateMatrix()
      canopy2Ref.current.setMatrixAt(i, dummy.matrix)
    })

    canopyRef.current.instanceMatrix.needsUpdate  = true
    canopy2Ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group name="instancedForest">
      {/*
        THREE draw calls: 1 for trunks, 1 for main canopies, 1 for secondary canopies.
        COUNT copies of each geometry are rendered per call.
        args={[null, null, COUNT]} means: "no geometry/material yet, COUNT instances"
        Geometry and material are provided as children.
      */}

      {/* Trunks — static, one draw call for all COUNT trunks */}
      <instancedMesh ref={trunkRef} args={[null, null, COUNT]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 1.8, 8]} />
        <primitive object={barkMat} attach="material" />
      </instancedMesh>

      {/* Main canopies — wind-animated, one draw call */}
      <instancedMesh ref={canopyRef} args={[null, null, COUNT]} castShadow>
        <sphereGeometry args={[1.1, 8, 6]} />
        <primitive object={leafMat} attach="material" />
      </instancedMesh>

      {/* Secondary canopies — wind-animated (opposite phase), one draw call */}
      <instancedMesh ref={canopy2Ref} args={[null, null, COUNT]} castShadow>
        <sphereGeometry args={[0.9, 8, 6]} />
        <primitive object={leafMat} attach="material" />
      </instancedMesh>
    </group>
  )
}
