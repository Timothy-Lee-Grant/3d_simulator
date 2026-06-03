/**
 * Buildings — all box structures in the scene.
 *
 * Each building is defined as data (position, dimensions, color) and
 * rendered by a reusable Building component. Adding a new building is
 * a one-line addition to the BUILDINGS array — no imperative scene.add()
 * calls, no manual cleanup.
 *
 * To scale this further: move BUILDINGS to a JSON file or a level editor
 * export, or procedurally generate the array.
 */

const BUILDINGS = [
  // ── Near (visible from spawn) ───────────────────────────────────────
  { pos: [-5,  -10], dims: [3, 6, 3], color: '#8B6355' }, // terracotta
  { pos: [ 6,   -9], dims: [4, 4, 4], color: '#6B8E9F' }, // slate-blue
  { pos: [-9,  -16], dims: [2, 9, 2], color: '#D4A373' }, // tan tower
  { pos: [10,   -5], dims: [5, 3, 3], color: '#7B9E87' }, // sage
  { pos: [-3,  -22], dims: [6, 5, 4], color: '#B87333' }, // copper
  { pos: [16,  -12], dims: [3, 8, 3], color: '#9B7B9B' }, // mauve tower
  { pos: [-15,  -8], dims: [4, 4, 5], color: '#C4956A' }, // sandy

  // ── Mid-range ───────────────────────────────────────────────────────
  { pos: [  3, -28], dims: [7, 3, 5], color: '#778899' }, // steel-blue slab
  { pos: [-11, -26], dims: [3, 6, 3], color: '#8FBC8F' }, // sea-green
  { pos: [ 21, -20], dims: [4, 7, 4], color: '#CD853F' }, // peru tower
  { pos: [-21, -22], dims: [5, 4, 3], color: '#708090' }, // slate
  { pos: [  9, -33], dims: [3, 9, 3], color: '#DEB887' }, // burlywood spire
  { pos: [-18, -35], dims: [6, 5, 6], color: '#6495ED' }, // cornflower
  { pos: [ 28, -10], dims: [4, 5, 4], color: '#BC8F8F' }, // rosy-brown
  { pos: [-28, -12], dims: [3, 7, 3], color: '#8B4513' }, // saddle-brown tower
  { pos: [ 14, -38], dims: [5, 6, 4], color: '#5F9EA0' }, // cadet blue
]

function Building({ pos: [x, z], dims: [w, h, d], color }) {
  return (
    <mesh
      position={[x, h / 2, z]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[w, h, d]} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}

export default function Buildings() {
  return (
    <group name="buildings">
      {BUILDINGS.map((b, i) => (
        <Building key={i} {...b} />
      ))}
    </group>
  )
}
