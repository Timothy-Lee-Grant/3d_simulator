import { useRef, useEffect } from 'react'

/**
 * World — ground plane and grid.
 *
 * Fog and sky color are set on the Canvas/scene in App.jsx since they
 * belong to the scene itself rather than a mesh object.
 */
export default function World() {
  const gridRef = useRef()

  // GridHelper has an array of two materials — make both semi-transparent
  useEffect(() => {
    if (!gridRef.current) return
    const mats = Array.isArray(gridRef.current.material)
      ? gridRef.current.material
      : [gridRef.current.material]
    mats.forEach(m => {
      m.transparent = true
      m.opacity = 0.18
    })
  }, [])

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshLambertMaterial color="#4a7c45" />
      </mesh>

      {/* Subtle grid lines */}
      <gridHelper
        ref={gridRef}
        args={[300, 60, '#3a6c35', '#3a6c35']}
      />
    </group>
  )
}
