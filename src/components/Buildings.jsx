import { useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '../systems/TextureGenerator'

/**
 * Buildings — box structures with PBR materials and emissive windows.
 *
 * Each building now has:
 *   - albedo + normal + roughness maps from TextureGenerator
 *   - a subtle tint colour multiplied with the albedo
 *   - emissive window planes on the player-facing face (+Z in local space)
 *
 * The building is now wrapped in a <group> so that window meshes can be
 * positioned relative to the building center (local space) rather than
 * requiring us to compute world coordinates for each window.
 *
 * ── Roughness maps ───────────────────────────────────────────────────────
 * When a roughnessMap is present, material.roughness is set to 1.0 so the
 * map value is used directly (finalRoughness = roughness × mapGreenChannel
 * = 1.0 × mapGreenChannel = mapGreenChannel). Setting roughness < 1 would
 * uniformly darken the roughness map — sometimes useful for "worn smooth"
 * effects but not here.
 *
 * ── Emissive windows ─────────────────────────────────────────────────────
 * Emissive colour adds a base illumination that is completely independent
 * of scene lighting. emissiveIntensity scales how bright that base is.
 * Even with zero light in the scene, an emissive surface glows.
 * This is the correct way to represent lit windows, LEDs, fire, screens.
 */

// ── Deterministic per-window random values ───────────────────────────────
// Using Math.sin hash so the same window is always the same state across
// renders — we don't want windows flickering every re-render.
const winRng = (a, b) => {
  const x = Math.sin(a * 9301 + b * 49297 + 13) * 233280
  return x - Math.floor(x)
}

// ── Building data ────────────────────────────────────────────────────────

const BUILDINGS = [
  // ── Near ─────────────────────────────────────────────────────────────
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

// ── Per-building material ────────────────────────────────────────────────

function useBuildingMaterial(textureKey, tint, w, h) {
  return useMemo(() => {
    const { albedo, normal, roughness } = getTexture(textureKey)

    const map = albedo.clone()
    map.needsUpdate = true
    map.repeat.set(w, h)

    const mat = new THREE.MeshStandardMaterial({
      map,
      color:     new THREE.Color(tint),
      metalness: 0,
    })

    if (roughness) {
      // Clone so repeat can be set independently per building
      const rgh = roughness.clone()
      rgh.needsUpdate = true
      rgh.repeat.copy(map.repeat)
      mat.roughnessMap = rgh
      // With a roughness map, set base roughness = 1.0 so the map drives the value
      // directly (finalRoughness = 1.0 × mapGreenChannel)
      mat.roughness = 1.0
    } else {
      mat.roughness = textureKey === 'plaster' ? 0.90 : 0.85
    }

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

// ── Window planes ────────────────────────────────────────────────────────

/**
 * Generates a grid of emissive window planes on the +Z face of the building.
 * The +Z face is the side the player sees first (buildings are placed at
 * negative Z values from spawn, so +Z faces toward Z=0 where the player is).
 *
 * Windows are placed in local space — the building group positions them
 * into the world automatically.
 */
function BuildingWindows({ w, h, d }) {
  const windows = useMemo(() => {
    if (h < 2.5) return []  // very short buildings don't get windows

    const cols  = Math.max(1, Math.floor(w / 1.4))
    const rows  = Math.max(1, Math.floor(h / 1.6))
    const winW  = Math.min(0.36, (w / cols) * 0.52)
    const winH  = Math.min(0.46, (h / rows) * 0.52)
    const zFace = d / 2 + 0.025   // slightly proud of the face to avoid z-fighting

    const result = []

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // 30% of windows are unlit — deterministic per building/position
        if (winRng(col + w * 13, row + h * 7) < 0.30) continue

        const xOff = (col + 0.5) * (w / cols) - w / 2
        const yOff = (row + 0.5) * (h / rows) - h / 2

        // Warm amber or cool office light — deterministic per window
        const isWarm     = winRng(col * 3.7, row * 5.3 + 1) > 0.38
        const intensity  = 1.4 + winRng(col, row + 200) * 1.0

        result.push({
          key:       `${row}-${col}`,
          pos:       [xOff, yOff, zFace],
          size:      [winW, winH],
          emissive:  isWarm ? '#ffbe44' : '#b8d4ff',
          intensity,
        })
      }
    }
    return result
  }, [w, h, d])

  if (windows.length === 0) return null

  return (
    <>
      {windows.map(({ key, pos, size, emissive, intensity }) => (
        <mesh key={key} position={pos}>
          <planeGeometry args={size} />
          <meshStandardMaterial
            color="#04040e"
            emissive={emissive}
            emissiveIntensity={intensity}
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
    </>
  )
}

// ── Building component ────────────────────────────────────────────────────

function Building({ pos: [x, z], dims: [w, h, d], textureKey, tint }) {
  const material = useBuildingMaterial(textureKey, tint, w, h)

  return (
    // Group centers the building at (x, h/2, z) so children use local space
    <group position={[x, h / 2, z]}>
      <mesh castShadow receiveShadow material={material}>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      <BuildingWindows w={w} h={h} d={d} />
    </group>
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
