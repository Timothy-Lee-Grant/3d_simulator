import { useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * Rocks — sphere boulders on the ground.
 *
 * All rocks share a single stone material. Each rock's unique size and
 * position comes from the ROCKS data array. The stone texture gives the
 * surface weight and realism that a flat grey Lambert never could.
 */

const ROCKS = [
  { pos: [ 3,  -4],  radius: 0.45 },
  { pos: [-2,  -3],  radius: 0.60 },
  { pos: [ 7,  -4],  radius: 0.35 },
  { pos: [-13, -5],  radius: 0.55 },
  { pos: [11, -13],  radius: 0.40 },
]

function useRockMaterial() {
  return useMemo(() => {
    const { albedo, normal } = getTexture('stone')

    const map = albedo.clone()
    map.needsUpdate = true
    map.repeat.set(2, 2)  // tile twice across the sphere's UV space

    const mat = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.88,
      metalness: 0,
    })

    if (normal) {
      const nrm = normal.clone()
      nrm.needsUpdate = true
      nrm.repeat.copy(map.repeat)
      mat.normalMap = nrm
      mat.normalScale.set(0.5, 0.5)
    }

    return mat
  }, [])
}

function Rock({ pos: [x, z], radius, material }) {
  return (
    <mesh position={[x, radius, z]} castShadow material={material}>
      <sphereGeometry args={[radius, 10, 7]} />
    </mesh>
  )
}

export default function Rocks() {
  const material = useRockMaterial()

  return (
    <group name="rocks">
      {ROCKS.map((r, i) => (
        <Rock key={i} {...r} material={material} />
      ))}
    </group>
  )
}
