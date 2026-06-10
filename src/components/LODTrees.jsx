/**
 * LODTrees.jsx — Phase 7.3: Level of Detail
 *
 * Demonstrates THREE.LOD — the Three.js built-in that swaps between high,
 * medium, and low-polygon versions of a mesh based on camera distance.
 *
 * This component renders a small cluster of 8 trees near the player's starting
 * area as a LOD demonstration. Walk toward them and watch the polygon count
 * change in Stats. Walk away and the detail reduces.
 *
 * ── Why LOD Matters ──────────────────────────────────────────────────────────
 *
 * The GPU processes every triangle in every visible mesh every frame. A sphere
 * with 1,024 triangles 200 units away is indistinguishable from a sphere with
 * 16 triangles at that distance — they project to the same few pixels on screen.
 * You're paying 64× the triangle cost for zero visible improvement.
 *
 * LOD solves this by swapping the mesh to a lower-polygon version at a threshold
 * distance. The geometry change is invisible at that distance, but the triangle
 * savings are immediate.
 *
 * ── THREE.LOD API ────────────────────────────────────────────────────────────
 *
 * THREE.LOD is a special Object3D subclass. Instead of children, it has "levels":
 *
 *   const lod = new THREE.LOD()
 *   lod.addLevel(highPolyMesh,  0)    // use when distance < 12
 *   lod.addLevel(medPolyMesh,  12)    // use when distance < 30
 *   lod.addLevel(lowPolyMesh,  30)    // use when distance < 80
 *   lod.addLevel(emptyMesh,    80)    // invisible (culled) beyond 80
 *
 * Every frame, call:
 *   lod.update(camera)
 *
 * This measures the distance from `lod.position` to `camera.position`,
 * finds the first level whose distance threshold is ≤ that distance,
 * and shows only that level's mesh.
 *
 * ── LOD Levels for Trees ─────────────────────────────────────────────────────
 *
 *   Level 0 (< 15 units):  Full-detail — trunk + 2 canopies at normal polygon count
 *   Level 1 (15–35 units): Medium — same geometry, fewer segments
 *   Level 2 (35–70 units): Low — simplified trunk + single canopy sphere
 *   Level 3 (> 70 units):  Billboard — flat quad facing camera (see below)
 *
 * The performance win at Level 3 is enormous. A billboard is 2 triangles.
 * The full tree is ~100 triangles. For 500 distant trees:
 *   Full geometry: 50,000 triangles
 *   Billboards:    1,000 triangles  ← 50× reduction
 *
 * ── Billboards ───────────────────────────────────────────────────────────────
 *
 * A billboard is a PlaneGeometry that always faces the camera. In Three.js,
 * this is implemented by setting the mesh to `THREE.AlwaysFaceCamera` or by
 * using a Sprite. Here we use THREE.Sprite for simplicity.
 *
 * Sprites are PlaneGeometry planes that automatically billboard — the GPU handles
 * the orientation math, so you never manually set their rotation.
 *
 * A SpriteMaterial with a Canvas-generated tree image makes a convincing distant
 * tree at effectively zero triangle cost.
 *
 * ── Integration Note ─────────────────────────────────────────────────────────
 *
 * This component sits alongside InstancedForest (which renders 50 trees in 3
 * draw calls without LOD). In production, you'd combine both techniques:
 * instance the LOD groups using an instanced approach, or use the instancing
 * feature of THREE.LOD (available in newer Three.js via LOD.autoUpdate + frustum).
 *
 * For this project, the separation makes it easier to compare the two approaches.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getTerrainHeight } from '../systems/terrain'
import { getTexture } from '../systems/TextureGenerator'

// ── LOD cluster positions ─────────────────────────────────────────────────────
// Near-ish to spawn, clearly visible as you walk forward.
const LOD_CLUSTER = [
  [ 12,  -5], [-11,  -4], [ 16, -10],
  [-14,  -8], [  8,  -3], [-18, -13],
  [ 20, -16], [-22, -11],
]

// ── Geometry factories (created once and shared) ──────────────────────────────

const GEO_TRUNK_HI   = new THREE.CylinderGeometry(0.20, 0.24, 1.8, 10)  // 80 tris
const GEO_CANOPY_HI  = new THREE.SphereGeometry(1.1, 12, 9)             // ~200 tris
const GEO_TRUNK_MED  = new THREE.CylinderGeometry(0.20, 0.24, 1.8, 7)   // 56 tris
const GEO_CANOPY_MED = new THREE.SphereGeometry(1.1, 8, 6)              // ~80 tris
const GEO_TRUNK_LOW  = new THREE.CylinderGeometry(0.20, 0.24, 1.8, 5)   // 40 tris
const GEO_CANOPY_LOW = new THREE.SphereGeometry(1.1, 5, 4)              // ~30 tris

// ── Billboard texture ─────────────────────────────────────────────────────────
// A Canvas 2D drawing of a tree silhouette for the farthest LOD level.
function makeTreeBillboardTexture() {
  const size   = 64
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size * 1.5
  const ctx     = canvas.getContext('2d')

  // Trunk
  ctx.fillStyle = '#5a3a1a'
  ctx.fillRect(size * 0.44, size, size * 0.12, size * 0.5)

  // Canopy — three overlapping ovals for a simple tree silhouette
  ctx.fillStyle = '#2d6b28'
  ctx.beginPath(); ctx.ellipse(size * 0.5, size * 0.55, size * 0.35, size * 0.45, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#3d8a30'
  ctx.beginPath(); ctx.ellipse(size * 0.4, size * 0.65, size * 0.22, size * 0.28, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(size * 0.62, size * 0.60, size * 0.20, size * 0.26, 0, 0, Math.PI * 2); ctx.fill()

  const tex          = new THREE.CanvasTexture(canvas)
  tex.colorSpace     = THREE.SRGBColorSpace
  return tex
}

// ── Build one LOD object ──────────────────────────────────────────────────────

function buildTreeLOD(x, y, z, barkMat, leafMat, billboardMat) {
  const lod = new THREE.LOD()
  lod.position.set(x, y, z)

  // ── Level 0: High detail (< 15 units) ─────────────────────────────────
  const high = new THREE.Group()
  high.add(new THREE.Mesh(GEO_TRUNK_HI,  barkMat))
  const canHi = new THREE.Mesh(GEO_CANOPY_HI, leafMat)
  canHi.position.y = 2.2; high.add(canHi)
  const can2Hi = new THREE.Mesh(GEO_CANOPY_HI, leafMat)
  can2Hi.position.set(0.4, 1.9, 0); can2Hi.scale.setScalar(0.82); high.add(can2Hi)
  high.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true }})
  lod.addLevel(high, 0)

  // ── Level 1: Medium detail (15–35 units) ──────────────────────────────
  const med = new THREE.Group()
  med.add(new THREE.Mesh(GEO_TRUNK_MED, barkMat))
  const canMed = new THREE.Mesh(GEO_CANOPY_MED, leafMat)
  canMed.position.y = 2.2; med.add(canMed)
  lod.addLevel(med, 15)

  // ── Level 2: Low detail (35–70 units) ─────────────────────────────────
  const low = new THREE.Group()
  low.add(new THREE.Mesh(GEO_TRUNK_LOW, barkMat))
  const canLow = new THREE.Mesh(GEO_CANOPY_LOW, leafMat)
  canLow.position.y = 2.0; low.add(canLow)
  lod.addLevel(low, 35)

  // ── Level 3: Billboard (70+ units) ────────────────────────────────────
  // THREE.Sprite: a quad that always faces the camera — zero rotation code needed.
  const billboard = new THREE.Sprite(billboardMat)
  billboard.scale.set(2.2, 3.4, 1)          // world units width × height
  billboard.position.y = 1.7                 // center of sprite at tree midpoint
  const billGroup = new THREE.Group()
  billGroup.add(billboard)
  lod.addLevel(billGroup, 70)

  return lod
}

// ── LODTrees component ────────────────────────────────────────────────────────

export default function LODTrees() {
  const { camera } = useThree()

  // Build materials once
  const { barkMat, leafMat, billboardMat } = useMemo(() => {
    const { albedo: barkAlbedo, normal: barkNormal } = getTexture('bark')
    const barkMat = new THREE.MeshStandardMaterial({ map: barkAlbedo, roughness: 0.95 })
    if (barkNormal) { barkMat.normalMap = barkNormal; barkMat.normalScale.set(0.5, 0.5) }

    const { albedo: leafAlbedo } = getTexture('leaves')
    const leafMat = new THREE.MeshStandardMaterial({ map: leafAlbedo, roughness: 0.9 })

    const billboardTex = makeTreeBillboardTexture()
    const billboardMat = new THREE.SpriteMaterial({ map: billboardTex, transparent: true })

    return { barkMat, leafMat, billboardMat }
  }, [])

  // Build LOD objects once
  const lods = useMemo(() =>
    LOD_CLUSTER.map(([x, z]) => {
      const y = getTerrainHeight(x, z)
      return buildTreeLOD(x, y, z, barkMat, leafMat, billboardMat)
    }),
  [barkMat, leafMat, billboardMat])

  // Update LOD level selection every frame
  useFrame(() => {
    lods.forEach(lod => lod.update(camera))
  })

  // Add LOD objects to scene via <primitive>
  return (
    <group name="lodTrees">
      {lods.map((lod, i) => (
        <primitive key={i} object={lod} />
      ))}
    </group>
  )
}
