/**
 * Trees — each tree is a cylinder trunk + two overlapping sphere canopies.
 *
 * A Tree is a self-contained component. Adding more trees means adding
 * coordinates to the POSITIONS array. In a future version, swap the
 * primitive geometry here for a GLTF model — only this file changes.
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

function Tree({ position: [x, z] }) {
  return (
    <group position={[x, 0, z]}>
      {/* Trunk */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 1.8, 10]} />
        <meshLambertMaterial color="#6B4423" />
      </mesh>

      {/* Main canopy */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <sphereGeometry args={[1.1, 10, 7]} />
        <meshLambertMaterial color="#2E7D32" />
      </mesh>

      {/* Secondary canopy — offset for a natural, irregular silhouette */}
      <mesh position={[0.4, 1.9, 0]} castShadow>
        <sphereGeometry args={[0.9, 10, 7]} />
        <meshLambertMaterial color="#388E3C" />
      </mesh>
    </group>
  )
}

export default function Trees() {
  return (
    <group name="trees">
      {POSITIONS.map(([x, z], i) => (
        <Tree key={i} position={[x, z]} />
      ))}
    </group>
  )
}
