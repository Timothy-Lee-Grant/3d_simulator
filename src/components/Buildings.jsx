import { useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * Buildings — all box structures in the scene.
 *
 * Each building now carries a `textureKey` (which surface material to use)
 * and a `tint` colour (multiplied with the texture albedo — so brick
 * buildings can be different shades while still sharing the same base texture).
 *
 * Material creation is inside a useMemo so it runs once per building
 * instance. We clone the shared texture before setting per-instance
 * `repeat`, because repeat is a property of the texture object: if we
 * mutated the shared instance every building would use the same repeat.
 *
 * Textures tile at roughly 1 unit per tile — designed so 1 Three.js unit
 * ≈ 1 metre gives real-world brick and stone proportions.
 */

const BUILDINGS = [
  // ── Near (visible from spawn) ─────────────────────────────────────────
  { pos: [-5,  -10], dims: [3, 6, 3], textureKey: 'brick',    tint: '#c4a080' },
  { pos: [ 6,   -9], dims: [4, 4, 4], textureKey: 'concrete', tint: '#aabbc8' },
  { pos: [-9,  -16], dims: [2, 9, 2], textureKey: 'plaster',  tint: '#d4c4a0' },
  { pos: [10,   -5], dims: [5, 3, 3], textureKey: 'plaster',  tint: '#b4c8b4' },
  { pos: [-3,  -22], dims: [6, 5, 4], textureKey: 'brick',    tint: '#c89060' },
  { pos: [16,  -12], dims: [3, 8, 3], textureKey: 'concrete', tint: '#b8a8c0' },
  { pos: [-15,  -8], dims: [4, 4, 5], textureKey: 'plaster',  tint: '#d0b890' },

  // ── Mid-range ─────────────────────────────────────────────────────────
  { pos: [  3, -28], dims: [7, 3, 5], textureKey: 'concrete', tint: '#9cacb8' },
  { pos: [-11, -26], dims: [3, 6, 3], textureKey: 'plaster',  tint: '#a8c4a0' },
  { pos: [ 21, -20], dims: [4, 7, 4], textureKey: 'brick',    tint: '#c09050' },
  { pos: [-21, -22], dims: [5, 4, 3], textureKey: 'stone',    tint: '#909090' },
  { pos: [  9, -33], dims: [3, 9, 3], textureKey: 'plaster',  tint: '#d4c098' },
  { pos: [-18, -35], dims: [6, 5, 6], textureKey: 'concrete', tint: '#8898c8' },
  { pos: [ 28, -10], dims: [4, 5, 4], textureKey: 'brick',    tint: '#c09898' },
  { pos: [-28, -12], dims: [3, 7, 3], textureKey: 'stone',    tint: '#806040' },
  { pos: [ 14, -38], dims: [5, 6, 4], textureKey: 'concrete', tint: '#709098' },
]

// ── Per-building material ─────────────────────────────────────────────────

function useBuildingMaterial(textureKey, tint, w, h) {
  return useMemo(() => {
    const { albedo, normal } = getTexture(textureKey)

    // Clone albedo so we can set a unique repeat without affecting other buildings
    const map = albedo.clone()
    map.needsUpdate = true
    // tile based on surface size: ~1 texture per metre
    map.repeat.set(w, h)

    const mat = new THREE.MeshStandardMaterial({
      map,
      color:     new THREE.Color(tint),  // multiplied with texture — subtle tint
      roughness: textureKey === 'concrete' ? 0.92 : 0.82,
      metalness: 0,
    })

    if (normal) {
      const nrm = normal.clone()
      nrm.needsUpdate = true
      nrm.repeat.copy(map.repeat)
      mat.normalMap = nrm
      mat.normalScale.set(
        textureKey === 'brick' ? 0.7 : 0.4,
        textureKey === 'brick' ? 0.7 : 0.4,
      )
    }

    return mat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureKey, tint, w, h])
}

// ── Building component ────────────────────────────────────────────────────

function Building({ pos: [x, z], dims: [w, h, d], textureKey, tint }) {
  const material = useBuildingMaterial(textureKey, tint, w, h)

  return (
    <mesh
      position={[x, h / 2, z]}
      castShadow
      receiveShadow
      material={material}
    >
      <boxGeometry args={[w, h, d]} />
    </mesh>
  )
}

// ── Buildings group ───────────────────────────────────────────────────────

export default function Buildings() {
  return (
    <group name="buildings">
      {BUILDINGS.map((b, i) => (
        <Building key={i} {...b} />
      ))}
    </group>
  )
}
