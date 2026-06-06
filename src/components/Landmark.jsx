import { getTerrainHeight } from '../systems/terrain'

/**
 * Landmark — the distant obelisk at Z=-50.
 * Gives the player a visual reference point to navigate toward.
 * Composed of two stacked boxes (wider base, narrower spire).
 */
export default function Landmark() {
  const groundY = getTerrainHeight(0, -50)
  return (
    <group name="landmark" position={[0, groundY, -50]}>
      {/* Base block */}
      <mesh position={[0, 7, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 14, 2]} />
        <meshLambertMaterial color="#d4c5b0" />
      </mesh>

      {/* Spire */}
      <mesh position={[0, 8.5, 0]} castShadow>
        <boxGeometry args={[1, 17, 1]} />
        <meshLambertMaterial color="#c8b89a" />
      </mesh>
    </group>
  )
}
