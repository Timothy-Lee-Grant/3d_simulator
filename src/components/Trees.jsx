import { useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * Trees — cylinder trunk + two overlapping sphere canopies.
 *
 * Trunks use the bark texture (vertical ridges, brown tones).
 * Canopies use the leaves texture (mottled greens).
 *
 * Both materials are created once and shared across all tree instances —
 * identical geometry + identical material = no need to clone. This is
 * more efficient than per-instance material creation.
 */

const POSITIONS = [
  [ 4,  -6],
  [-7, -13],
  [12, -18],
  [-5, -28],
  [20,  -8],
  [-25,-18],
  [ 6, -35],
  [-14,-40],
]

// ── Shared materials (created once for all trees) ─────────────────────────

function useTreeMaterials() {
  return useMemo(() => {
    // Bark
    const { albedo: barkAlbedo, normal: barkNormal } = getTexture('bark')
    const barkMap = barkAlbedo.clone()
    barkMap.needsUpdate = true
    barkMap.repeat.set(1, 2)  // wrap around trunk once, twice vertically

    const barkMat = new THREE.MeshStandardMaterial({
      map:      barkMap,
      roughness: 0.95,
      metalness: 0,
    })
    if (barkNormal) {
      const nrm = barkNormal.clone()
      nrm.needsUpdate = true
      nrm.repeat.copy(barkMap.repeat)
      barkMat.normalMap = nrm
      barkMat.normalScale.set(0.6, 0.6)
    }

    // Leaves — primary canopy
    const { albedo: leafAlbedo } = getTexture('leaves')
    const leafMap1 = leafAlbedo.clone()
    leafMap1.needsUpdate = true
    leafMap1.repeat.set(2, 2)
    const leafMat1 = new THREE.MeshStandardMaterial({
      map:      leafMap1,
      roughness: 0.90,
      metalness: 0,
    })

    // Leaves — secondary canopy (slightly different repeat for variety)
    const leafMap2 = leafAlbedo.clone()
    leafMap2.needsUpdate = true
    leafMap2.repeat.set(1.6, 1.6)
    const leafMat2 = new THREE.MeshStandardMaterial({
      map:      leafMap2,
      color:    new THREE.Color('#d8f0d0'),  // subtle lighter tint
      roughness: 0.90,
      metalness: 0,
    })

    return { barkMat, leafMat1, leafMat2 }
  }, [])
}

// ── Tree component ────────────────────────────────────────────────────────

function Tree({ position: [x, z], barkMat, leafMat1, leafMat2 }) {
  return (
    <group position={[x, 0, z]}>
      {/* Trunk */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow material={barkMat}>
        <cylinderGeometry args={[0.2, 0.24, 1.8, 10]} />
      </mesh>

      {/* Main canopy */}
      <mesh position={[0, 2.2, 0]} castShadow material={leafMat1}>
        <sphereGeometry args={[1.1, 10, 7]} />
      </mesh>

      {/* Secondary canopy */}
      <mesh position={[0.4, 1.9, 0]} castShadow material={leafMat2}>
        <sphereGeometry args={[0.9, 10, 7]} />
      </mesh>
    </group>
  )
}

// ── Trees group ───────────────────────────────────────────────────────────

export default function Trees() {
  const { barkMat, leafMat1, leafMat2 } = useTreeMaterials()

  return (
    <group name="trees">
      {POSITIONS.map(([x, z], i) => (
        <Tree
          key={i}
          position={[x, z]}
          barkMat={barkMat}
          leafMat1={leafMat1}
          leafMat2={leafMat2}
        />
      ))}
    </group>
  )
}
