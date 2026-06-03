/**
 * Rocks — scattered sphere boulders on the ground.
 * Each rock sits on the ground: position.y = radius.
 */

const ROCKS = [
  { pos: [ 3,  -4], radius: 0.45, color: '#888888' },
  { pos: [-2,  -3], radius: 0.60, color: '#777777' },
  { pos: [ 7,  -4], radius: 0.35, color: '#999999' },
  { pos: [-13, -5], radius: 0.55, color: '#8a8a8a' },
  { pos: [11, -13], radius: 0.40, color: '#707070' },
]

function Rock({ pos: [x, z], radius, color }) {
  return (
    <mesh position={[x, radius, z]} castShadow>
      <sphereGeometry args={[radius, 10, 7]} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}

export default function Rocks() {
  return (
    <group name="rocks">
      {ROCKS.map((r, i) => (
        <Rock key={i} {...r} />
      ))}
    </group>
  )
}
