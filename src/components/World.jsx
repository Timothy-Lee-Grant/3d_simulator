import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * World — ground plane and grid.
 *
 * The ground now uses a tiling grass texture instead of a flat colour.
 * Tiled at 1 texture per 2 units → fine enough to see grass detail but
 * not so fine it looks like a close-up photograph.
 */
export default function World() {
  const gridRef = useRef()

  // Grass material — created once, shared by the single ground mesh
  const groundMat = useMemo(() => {
    const { albedo } = getTexture('grass')

    const map = albedo.clone()
    map.needsUpdate = true
    map.repeat.set(80, 80)  // 300 unit ground ÷ ~3.75 units per tile

    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.95,
      metalness: 0,
    })
  }, [])

  // GridHelper has an array of two materials — make both semi-transparent
  useEffect(() => {
    if (!gridRef.current) return
    const mats = Array.isArray(gridRef.current.material)
      ? gridRef.current.material
      : [gridRef.current.material]
    mats.forEach(m => {
      m.transparent = true
      m.opacity = 0.12   // slightly more subtle over textured grass
    })
  }, [])

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={groundMat}>
        <planeGeometry args={[300, 300]} />
      </mesh>

      {/* Subtle grid lines — helps with spatial orientation */}
      <gridHelper
        ref={gridRef}
        args={[300, 60, '#2a4c25', '#2a4c25']}
      />
    </group>
  )
}
