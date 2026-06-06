import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import NPC from './NPC'
import { useWorldStore } from '../store/useWorldStore'
import levelData from '../../public/levels/level_01.json'

/**
 * Level — data-driven scene composition and trigger volume system.
 *
 * ── Phase 4.1 ────────────────────────────────────────────────────────────
 *
 * This component solves a fundamental scaling problem: when scene content
 * is hardcoded in JSX, adding a new NPC, moving a trigger zone, or
 * balancing an area requires a code change, a save, and a reload. In a
 * real game, designers (who may not write code) need to adjust content
 * without touching source files.
 *
 * The solution is DATA-DRIVEN SCENE COMPOSITION: store all entity
 * descriptions in a JSON file, write a generic renderer that reads
 * that JSON and produces the correct JSX. The code becomes infrastructure;
 * the data drives the content.
 *
 * ── What lives in the JSON ────────────────────────────────────────────────
 *
 * level_01.json (in public/levels/) contains:
 *
 *   meta     — id, name, version
 *   world    — spawn point, fog density, cycle speed
 *   npcs     — array of NPC descriptors (id, name, position, rotation, etc.)
 *   triggers — array of proximity trigger zones
 *
 * Vite's static import resolves `../../public/levels/level_01.json` at
 * build time — no fetch, no async, no loading state. The JSON is bundled
 * directly into the JavaScript module graph. For larger games, you would
 * use `fetch()` to load levels on demand.
 *
 * ── NPCs from data ────────────────────────────────────────────────────────
 *
 * App.jsx previously hardcoded three <NPC> tags. Now Level.jsx maps over
 * `levelData.npcs` to produce exactly the same output — but any number
 * of NPCs can be added to the JSON without touching any source file:
 *
 *   levelData.npcs.map(npc => <NPC key={npc.id} {...npc} />)
 *
 * ── Trigger Volumes ───────────────────────────────────────────────────────
 *
 * A trigger volume is an invisible region of space. When the player enters
 * it, an event fires. This is the foundation for:
 *   - Area discovery ("You have arrived at The Lake")
 *   - Quest progression ("Entered the dungeon → start timer")
 *   - Audio transitions ("You are near water → fade in river sound")
 *   - Loading zone transitions ("Crossed the border → load next chunk")
 *
 * Implementation in useFrame:
 *   1. Get current camera position (the player's position in world space)
 *   2. For each trigger in levelData.triggers:
 *      a. Compute XZ distance from player to trigger centre
 *      b. If distance < trigger.radius AND this trigger hasn't fired yet:
 *         → call discoverArea(trigger.id), which writes to useWorldStore
 *         → add trigger.id to firedRef.current to prevent re-firing
 *
 * Why useRef for firedRef rather than state?
 *   Fired trigger state is checked 60× per second. Using useState would
 *   cause a re-render every time an area is discovered. useRef mutates
 *   directly — no re-render, no performance cost.
 *
 * Why XZ distance only (ignoring Y)?
 *   Triggers are placed on the XZ plane. The player's Y varies with
 *   terrain height, but we want "are you near this location on the map"
 *   not "are you at exactly this altitude." XZ-only is the right semantic.
 *
 * ── Separation of Concerns ────────────────────────────────────────────────
 *
 * Level.jsx is responsible for:
 *   ✓ Reading level data from JSON
 *   ✓ Rendering entities listed in that data (NPCs)
 *   ✓ Running trigger zone checks
 *   ✓ Notifying the world store when triggers fire
 *
 * Level.jsx is NOT responsible for:
 *   ✗ Rendering terrain (World.jsx owns that)
 *   ✗ Rendering buildings (Buildings.jsx owns that)
 *   ✗ Player movement (Player.jsx owns that)
 *   ✗ UI (Overlay.jsx owns that)
 *
 * This boundary keeps each file small, focused, and testable.
 *
 * ── Extending the system ─────────────────────────────────────────────────
 *
 * To add a new NPC: append one object to the `npcs` array in level_01.json.
 * To add a new trigger zone: append to `triggers`. No code changes needed.
 *
 * To support multiple levels, add a `levelId` prop to Level.jsx and
 * dynamically import the corresponding JSON. Vite's glob imports
 * (`import.meta.glob('/public/levels/*.json')`) enable this cleanly.
 */

// ── Trigger visualisation toggle ─────────────────────────────────────────
// Set to true during development to see trigger radii as wireframe circles
const SHOW_TRIGGERS = false

// ── Trigger radius visual ─────────────────────────────────────────────────

function TriggerDebugRing({ position, radius }) {
  if (!SHOW_TRIGGERS) return null
  return (
    <mesh position={[position[0], 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.1, radius, 48]} />
      <meshBasicMaterial color="#00ff88" transparent opacity={0.35} side={2} />
    </mesh>
  )
}

// ── Main Level component ──────────────────────────────────────────────────

export default function Level() {
  const { camera } = useThree()
  const discoverArea = useWorldStore(state => state.discoverArea)

  // Track which triggers have already fired this session.
  // Using a Set in a ref: O(1) lookup, no re-renders.
  const firedRef = useRef(new Set())

  // Log level load once on mount
  useEffect(() => {
    console.log(`[Level] Loaded: "${levelData.meta.name}" (v${levelData.meta.version})`)
    console.log(`[Level] ${levelData.npcs.length} NPCs, ${levelData.triggers.length} trigger zones`)
  }, [])

  // ── Trigger volume check — runs every frame ───────────────────────────
  useFrame(() => {
    const px = camera.position.x
    const pz = camera.position.z

    for (const trigger of levelData.triggers) {
      // Skip triggers that have already fired
      if (firedRef.current.has(trigger.id)) continue

      // XZ-plane distance (ignore Y — triggers are "on the map" not "at altitude")
      const dx   = px - trigger.position[0]
      const dz   = pz - trigger.position[2]
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < trigger.radius) {
        firedRef.current.add(trigger.id)

        if (trigger.event === 'discover_area') {
          discoverArea(trigger.id)
          console.log(`[Level] Discovered: "${trigger.label}"`)
        }
      }
    }
  })

  return (
    <group name="level">
      {/* ── NPCs from level data ────────────────────────────────────── */}
      {levelData.npcs.map(npc => (
        <NPC
          key={npc.id}
          npcId={npc.id}
          name={npc.name}
          position={npc.position}
          rotation={npc.rotation}
          phaseOffset={npc.phaseOffset}
        />
      ))}

      {/* ── Trigger debug rings (dev only) ─────────────────────────── */}
      {levelData.triggers.map(trigger => (
        <TriggerDebugRing
          key={trigger.id}
          position={trigger.position}
          radius={trigger.radius}
        />
      ))}
    </group>
  )
}
