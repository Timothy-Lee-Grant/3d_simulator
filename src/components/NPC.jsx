/**
 * NPC.jsx — Phase 6.2 update: drives Human's animation state
 *
 * Adds on top of the Phase 3–5 interaction layer:
 *
 *   4. ANIMATION STATE DRIVE — NPC now has a simple AI that randomly
 *      switches between IDLE and WALK states. The walk-in-place animation
 *      gives each character life without requiring pathfinding.
 *
 *      State machine rules:
 *        IDLE → WALK after idle_duration seconds (random 4–12s)
 *        WALK → IDLE after walk_duration seconds (random 2–5s)
 *
 *      The NPC also faces a slowly rotating direction while "walking" —
 *      a subtle rotation that makes the pacing feel purposeful.
 *
 *   5. PATROL (optional prop) — if `patrolPoints` is provided as an array
 *      of two [x,z] positions, the NPC actually moves between them along
 *      the terrain surface. Demonstrates skeletal animation responding to
 *      real world-space movement.
 *
 * ── Why drive animation from the NPC, not the Player? ───────────────────────
 *
 * Human.jsx is a pure visual component — it only knows about posing itself.
 * NPC.jsx is the AI/game-mechanic layer. Separating concerns means:
 *   - Human can be reused for decoration, cutscenes, or player avatar
 *   - The AI can be swapped without touching rendering code
 *   - Multiple different AI controllers (guard patrol, random wander, scripted)
 *     can all use the same Human visual component
 *
 * ── How patrol works ─────────────────────────────────────────────────────────
 *
 * NPC moves between patrolPoints[0] and patrolPoints[1] by lerping position
 * each frame. The NPC group's Y rotation is set to face the travel direction.
 * Terrain height is sampled at the current XZ each frame so the NPC stays
 * on the ground surface as it moves.
 *
 * No pathfinding — NPCs walk in straight lines. Full pathfinding (navmesh,
 * A* search) would be Phase 8+.
 */

import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useInteractionStore } from '../store/useInteractionStore'
import { registerInteractable, deregisterInteractable } from '../systems/interactables'
import { getTerrainHeight } from '../systems/terrain'
import { playNPCMurmur } from '../systems/AudioManager'
import { ANIM } from '../systems/AnimationStateMachine'
import Human from './Human'

// ── Constants ─────────────────────────────────────────────────────────────────

const HIGHLIGHT_LERP = 0.18
const RING_RADIUS    = 0.55
const RING_TUBE      = 0.025
const RING_SEGMENTS  = 32
const RING_COLOR     = '#88ccff'
const RING_EMISSIVE  = '#4499ee'
const RING_Y         = 0.02
const PATROL_SPEED   = 1.4   // world units per second

// Per-NPC voice pitch
const PITCH_SCALES = { npc_01: 0.92, npc_02: 1.08, npc_03: 0.85 }
const HEAD_HEIGHT  = 1.62

// ── NPC ───────────────────────────────────────────────────────────────────────

/**
 * @param {string}                 npcId
 * @param {string}                 name
 * @param {[number,number,number]} position        World position (y snapped to terrain)
 * @param {[number,number,number]} rotation        Initial world rotation
 * @param {number}                 phaseOffset     Passed to Human idle animation
 * @param {[[number,number],[number,number]]} [patrolPoints]
 *   Optional. Two [x,z] pairs defining a patrol path. If provided the NPC
 *   physically walks between them. If omitted, walk is walk-in-place.
 */
export default function NPC({
  npcId,
  name,
  position      = [0, 0, 0],
  rotation      = [0, 0, 0],
  phaseOffset   = 0,
  patrolPoints  = null,
}) {
  // ── Terrain snap ───────────────────────────────────────────────────────
  const groundY       = getTerrainHeight(position[0], position[2])
  const basePosition  = useRef([position[0], groundY, position[2]])

  // ── Refs ───────────────────────────────────────────────────────────────
  const rootRef       = useRef()
  const ringRef       = useRef()
  const highlightVal  = useRef(0)
  const murmurTimer   = useRef(phaseOffset * 2.5 + 4 + Math.random() * 6)

  // ── Animation state ────────────────────────────────────────────────────
  // React state drives the animationState prop on Human — triggers re-render
  // but only when state actually changes (every 2–12 seconds), not every frame.
  const [animState, setAnimState] = useState(ANIM.IDLE)

  // AI timer: how long to stay in current state before switching
  const aiTimer = useRef(4 + Math.random() * 8)

  // Patrol: which point we're heading toward
  const patrolTarget = useRef(1)   // index into patrolPoints

  // ── Interaction store ──────────────────────────────────────────────────
  const lookingAt  = useInteractionStore(state => state.lookingAt)
  const isTargeted = lookingAt?.id === npcId

  // ── Register interactable ──────────────────────────────────────────────
  useEffect(() => {
    if (!rootRef.current) return
    registerInteractable(npcId, rootRef.current, { name })
    return () => deregisterInteractable(npcId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcId, name])

  // ── Per-frame logic ────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const root = rootRef.current
    if (!root) return

    // ── AI state machine ─────────────────────────────────────────────
    aiTimer.current -= delta
    if (aiTimer.current <= 0) {
      if (animState === ANIM.IDLE) {
        setAnimState(ANIM.WALK)
        aiTimer.current = 2 + Math.random() * 3      // walk for 2–5s
      } else {
        setAnimState(ANIM.IDLE)
        aiTimer.current = 4 + Math.random() * 8      // idle for 4–12s
      }
    }

    // ── Patrol movement ──────────────────────────────────────────────
    if (patrolPoints && animState === ANIM.WALK) {
      const target = patrolPoints[patrolTarget.current]
      const tx = target[0]
      const tz = target[1]

      const cx = root.position.x
      const cz = root.position.z

      const dx   = tx - cx
      const dz   = tz - cz
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < 0.2) {
        // Reached target — flip to the other patrol point
        patrolTarget.current = patrolTarget.current === 0 ? 1 : 0
      } else {
        // Move toward target
        const speed = PATROL_SPEED * delta
        const nx    = cx + (dx / dist) * speed
        const nz    = cz + (dz / dist) * speed
        const ny    = getTerrainHeight(nx, nz)

        root.position.set(nx, ny, nz)

        // Face the travel direction
        root.rotation.y = Math.atan2(dx, dz)
      }
    }

    // ── Murmur ───────────────────────────────────────────────────────
    murmurTimer.current -= delta
    if (murmurTimer.current <= 0) {
      murmurTimer.current = 8 + Math.random() * 14
      if (!useInteractionStore.getState().activeDialogue) {
        const pitch = PITCH_SCALES[npcId] ?? 1.0
        playNPCMurmur(
          root.position.x,
          root.position.y + HEAD_HEIGHT,
          root.position.z,
          pitch,
        )
      }
    }

    // ── Highlight ring ────────────────────────────────────────────────
    if (!ringRef.current) return

    const target = isTargeted ? 1 : 0
    highlightVal.current += (target - highlightVal.current) * HIGHLIGHT_LERP

    const v   = highlightVal.current
    const mat = ringRef.current.material
    ringRef.current.scale.setScalar(1 + v * 0.08)
    mat.opacity           = v * 0.85
    mat.emissiveIntensity = v * 2.5
  })

  // ── Render ─────────────────────────────────────────────────────────────
  const [bx, , bz] = basePosition.current
  const initY = getTerrainHeight(bx, bz)

  return (
    <group
      ref={rootRef}
      position={[bx, initY, bz]}
      rotation={rotation}
    >
      {/* Human figure with animation state driven from AI */}
      <Human
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        phaseOffset={phaseOffset}
        animationState={animState}
      />

      {/* Highlight ring */}
      <mesh
        ref={ringRef}
        position={[0, RING_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 8, RING_SEGMENTS]} />
        <meshStandardMaterial
          color={RING_COLOR}
          emissive={RING_EMISSIVE}
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
