/**
 * NPC.jsx — a Human figure that the player can look at and interact with.
 *
 * Wraps Human.jsx and adds the interaction layer on top:
 *
 *   1. REGISTRATION — on mount, the NPC's root group is registered with the
 *      interactables system so the raycaster in Player.jsx can find it.
 *      On unmount it's deregistered to prevent stale references.
 *
 *   2. HIGHLIGHT RING — a thin glowing ring at the NPC's feet appears when the
 *      player looks at this NPC and is within interaction range. It fades out
 *      immediately when the player looks away. This is the standard "object is
 *      selectable" feedback pattern used in most 3D games.
 *
 *      The ring uses MeshStandardMaterial with emissive colour so it glows even
 *      in shadow. The geometry is a thin TorusGeometry (ring shape).
 *
 *   3. STORE SUBSCRIPTION — the component subscribes to `lookingAt` in the
 *      interaction store. When `lookingAt.id === npcId`, it's being targeted.
 *      This drives the highlight ring's visibility.
 *
 * ── Why a separate component instead of modifying Human.jsx? ─────────────
 *
 * Human.jsx is a pure rendering component — it takes position/rotation/phaseOffset
 * and produces geometry. It has no knowledge of game mechanics. Keeping it pure
 * means it can be reused for decorative background characters, cutscenes, or any
 * context where interaction is not needed.
 *
 * NPC.jsx is the game-mechanic wrapper. This separation of concerns follows the
 * Entity-Component pattern: Human is the visual component, NPC adds the behaviour.
 */

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useInteractionStore } from '../store/useInteractionStore'
import { registerInteractable, deregisterInteractable } from '../systems/interactables'
import { getTerrainHeight } from '../systems/terrain'
import { playNPCMurmur } from '../systems/AudioManager'
import Human from './Human'

// How fast the highlight ring fades in/out (fraction of gap closed per frame at 60fps)
const HIGHLIGHT_LERP = 0.18

// Ring appearance
const RING_RADIUS    = 0.55   // outer radius of the torus (matches Human shoulder width)
const RING_TUBE      = 0.025  // tube radius (how thick the ring is)
const RING_SEGMENTS  = 32
const RING_COLOR     = '#88ccff'
const RING_EMISSIVE  = '#4499ee'
const RING_Y         = 0.02   // just above ground, avoids z-fighting with the floor

/**
 * @param {string}               npcId        Unique id, e.g. 'npc_01'
 * @param {string}               name         Display name shown in the interaction prompt
 * @param {[number,number,number]} position   World position
 * @param {[number,number,number]} rotation   World rotation (Euler, radians)
 * @param {number}               phaseOffset  Passed through to Human's idle animation
 */
// Per-NPC pitch scale — gives each character a subtly different voice
const PITCH_SCALES = { npc_01: 0.92, npc_02: 1.08, npc_03: 0.85 }
// Head height offset so murmurs come from the mouth, not the feet
const HEAD_HEIGHT = 1.62

export default function NPC({ npcId, name, position = [0, 0, 0], rotation = [0, 0, 0], phaseOffset = 0 }) {
  // Snap Y to terrain at this NPC's XZ position — the JSON stores y=0 as a placeholder
  const groundY = getTerrainHeight(position[0], position[2])
  const snappedPosition = [position[0], groundY, position[2]]

  // Root group — registered with the interactables system so the raycaster can hit it
  const rootRef  = useRef()
  // Ring mesh ref — animated opacity driven by highlight state
  const ringRef  = useRef()
  // Smooth highlight value: 0 = not highlighted, 1 = fully highlighted
  const highlightVal = useRef(0)

  // ── Murmur timer (5.1) ───────────────────────────────────────────────────
  // Each NPC emits a quiet positional ambient sound on a random interval.
  // Start at a staggered time so all three NPCs don't murmur simultaneously.
  const murmurTimer = useRef(phaseOffset * 2.5 + 4 + Math.random() * 6)

  // Read the interaction store — is this NPC currently targeted?
  const lookingAt = useInteractionStore(state => state.lookingAt)
  const isTargeted = lookingAt?.id === npcId

  // ── Register / deregister with the interactables system ──────────────────
  useEffect(() => {
    if (!rootRef.current) return

    registerInteractable(npcId, rootRef.current, { name })

    return () => deregisterInteractable(npcId)
  // name could change if NPCs get dynamic names, so include it in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcId, name])

  // ── Animate highlight ring + ambient murmur ──────────────────────────────
  useFrame((_, delta) => {
    // ── Murmur timer (5.1) ───────────────────────────────────────────────
    // Tick down; fire a positional murmur sound when it expires.
    // Don't murmur during active dialogue — it would overlap spoken text.
    murmurTimer.current -= delta
    if (murmurTimer.current <= 0) {
      // Random interval 8–22 seconds keeps NPCs from feeling mechanical
      murmurTimer.current = 8 + Math.random() * 14
      // Only play if no dialogue is open (avoid overlap with player interaction)
      if (!useInteractionStore.getState().activeDialogue) {
        const pitch = PITCH_SCALES[npcId] ?? 1.0
        playNPCMurmur(
          snappedPosition[0],
          snappedPosition[1] + HEAD_HEIGHT,
          snappedPosition[2],
          pitch,
        )
      }
    }

    // ── Highlight ring ───────────────────────────────────────────────────
    if (!ringRef.current) return

    const target = isTargeted ? 1 : 0
    highlightVal.current += (target - highlightVal.current) * HIGHLIGHT_LERP

    const v = highlightVal.current
    const mat = ringRef.current.material

    ringRef.current.scale.setScalar(1 + v * 0.08)
    mat.opacity          = v * 0.85
    mat.emissiveIntensity = v * 2.5
  })

  return (
    // Root group — registered with interactables, raycasts will hit Human geometry inside
    <group ref={rootRef} position={snappedPosition} rotation={rotation}>

      {/* ── Human visual (the actual character geometry + idle animation) ── */}
      {/* Position and rotation are handled by the root group above, so we
          pass zeros here — Human's own groups handle world offset */}
      <Human
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        phaseOffset={phaseOffset}
      />

      {/* ── Highlight ring at feet ──────────────────────────────────────── */}
      {/* Torus lying flat on the ground (rotated -90° on X axis).
          Uses MeshStandardMaterial for emissive glow support.
          Starts fully transparent — animated by useFrame above. */}
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
