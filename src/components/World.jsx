import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'
import { getTerrainHeight, TERRAIN_SIZE, TERRAIN_SEGMENTS } from '../systems/terrain'

/**
 * World — procedural terrain + grid.
 *
 * ── Phase 4.2: Procedural Terrain ────────────────────────────────────────
 *
 * The flat plane from Phase 1 is replaced with a PlaneGeometry whose
 * vertices are displaced in Y by getTerrainHeight(x, z). This creates
 * rolling hills and valleys without any external assets.
 *
 * Key concepts demonstrated here:
 *
 * 1. VERTEX DISPLACEMENT
 *    PlaneGeometry starts as a perfectly flat grid. We loop through every
 *    vertex in the `position` BufferAttribute and overwrite its Y component
 *    with the terrain height at that vertex's (x, z) coordinate.
 *
 *    The BufferAttribute stores all vertex data as a flat Float32Array.
 *    For a geometry with N vertices, positions = [x0,y0,z0, x1,y1,z1, ...].
 *    So vertex i lives at indices i*3, i*3+1, i*3+2.
 *
 * 2. NORMAL RECOMPUTATION
 *    Normals tell the lighting system which direction a surface "faces."
 *    PlaneGeometry initialises all normals pointing straight up (0, 1, 0).
 *    After vertex displacement those normals are wrong — a slope should
 *    face up-and-sideways. computeVertexNormals() fixes this: for each
 *    vertex it averages the geometric normals of all adjacent faces.
 *    Without this call, lighting on terrain looks completely wrong.
 *
 * 3. UV TILING
 *    PlaneGeometry UV coordinates default to [0,1] → [1,1]. We scale
 *    them so the grass texture tiles at roughly one tile per 3 world units,
 *    giving visible surface detail without the texture being stretched thin.
 *
 * 4. SPAWN FLATTEN
 *    getTerrainHeight() applies a radial smoothstep that zeroes out the
 *    noise within FLAT_RADIUS of the origin (see terrain.js). This World
 *    component doesn't need to know about that — it just calls the function
 *    and the flat zone falls out automatically.
 *
 * ── Performance ──────────────────────────────────────────────────────────
 *
 * useMemo ensures the geometry is built exactly once. The vertex
 * displacement loop runs in ~2ms (150×150 = 22,500 vertices) — invisible
 * cost at startup.
 */
export default function World() {
  const gridRef = useRef()

  // ── Terrain geometry (built once) ────────────────────────────────────────
  const terrainGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)

    // PlaneGeometry is created vertical (in XY plane). Rotate to lie flat.
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position.array
    const uvs       = geo.attributes.uv.array

    const tileSize = 3  // one texture tile per 3 world units

    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3]
      const z = positions[i * 3 + 2]

      // ── Vertex displacement ───────────────────────────────────────────
      positions[i * 3 + 1] = getTerrainHeight(x, z)

      // ── UV tiling ─────────────────────────────────────────────────────
      // Default UVs span [0,1] across the full plane. Scale so the grass
      // texture tiles (TERRAIN_SIZE / tileSize) times.
      uvs[i * 2]     = uvs[i * 2]     * TERRAIN_SIZE / tileSize
      uvs[i * 2 + 1] = uvs[i * 2 + 1] * TERRAIN_SIZE / tileSize
    }

    // MANDATORY: recompute normals after displacing vertices.
    // Without this, lighting ignores slope direction and terrain looks flat.
    geo.computeVertexNormals()

    return geo
  }, [])

  // ── Terrain material ──────────────────────────────────────────────────────
  const groundMat = useMemo(() => {
    const { albedo } = getTexture('grass')

    const map = albedo.clone()
    map.needsUpdate = true
    // UV tiling is baked into geometry UVs above — set repeat to 1
    map.repeat.set(1, 1)
    map.wrapS = map.wrapT = THREE.RepeatWrapping

    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.95,
      metalness: 0,
    })
  }, [])

  // ── GridHelper transparency ───────────────────────────────────────────────
  useEffect(() => {
    if (!gridRef.current) return
    const mats = Array.isArray(gridRef.current.material)
      ? gridRef.current.material
      : [gridRef.current.material]
    mats.forEach(m => {
      m.transparent = true
      m.opacity = 0.10
    })
  }, [])

  return (
    <group>
      {/* Procedural terrain — vertices displaced by getTerrainHeight */}
      <mesh geometry={terrainGeometry} material={groundMat} receiveShadow />

      {/* Grid at Y=0 — clips into hills naturally, helps spatial orientation */}
      <gridHelper ref={gridRef} args={[300, 60, '#2a4c25', '#2a4c25']} />
    </group>
  )
}
