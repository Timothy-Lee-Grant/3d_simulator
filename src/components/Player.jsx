/**
 * Player — first-person camera: movement, physics, collision, stamina,
 *          raycasting, and NPC dialogue.
 *
 * PointerLockControls (Drei) owns camera rotation. useFrame owns everything else.
 *
 * ── Physics (1.2) ────────────────────────────────────────────────────────
 *
 * velocityY integrates under gravity each frame. The ground check snaps the
 * camera back to EYE_HEIGHT and zeros velocity on contact.
 *
 * Coyote time: the player can still jump for COYOTE_TIME seconds after
 * walking off a ledge. lastGroundedTime tracks the most recent grounded frame.
 * On jump we set it to -Infinity to exhaust the coyote window immediately.
 *
 * ── Collision (1.1) ──────────────────────────────────────────────────────
 *
 * After each movement, resolveXZ() tests the new position against WORLD_COLLIDERS
 * and applies per-axis slide resolution (see systems/collision.js).
 *
 * ── Stamina ──────────────────────────────────────────────────────────────
 *
 * Stamina lives in a ref for per-frame math and is synced to the Zustand store
 * at ~20Hz so the HUD bar doesn't re-render 60 times/sec.
 *
 * ── Dialogue (3.4) ───────────────────────────────────────────────────────
 *
 * When E is pressed on a registered NPC:
 *   1. openDialogue(npcId, nodeKey) updates the interaction store
 *   2. document.exitPointerLock() frees the mouse for clicking responses
 *   3. useFrame returns early (no movement) while activeDialogue is set
 *
 * Number keys 1–4 in a separate keydown listener also advance dialogue,
 * so keyboard-only players don't need to click.
 *
 * ── Position sync ────────────────────────────────────────────────────────
 *
 * camera.position is snapshotted to the store every 2 s for the Phase 7
 * save/load system.
 */

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Vector3 } from 'three'
import useKeyboard from '../hooks/useKeyboard'
import useRaycast  from '../hooks/useRaycast'
import { playFootstep }    from '../systems/AudioManager'
import { resolveXZ }       from '../systems/collision'
import { WORLD_COLLIDERS } from '../data/colliders'
import { DIALOGUE }        from '../data/dialogue'
import { useInteractionStore } from '../store/useInteractionStore'
import { useGameStore }        from '../store/useGameStore'
import { useWorldStore }       from '../store/useWorldStore'

const SLOT_COUNT = 5

// ── Movement constants ────────────────────────────────────────────────────────
const WALK_SPEED      = 7.0
const SPRINT_SPEED    = 14.0
const EYE_HEIGHT      = 1.7
const BOB_WALK_FREQ   = 7
const BOB_SPRINT_FREQ = 12
const BOB_AMPLITUDE   = 0.045

// ── Physics constants ─────────────────────────────────────────────────────────
const GRAVITY      = 22     // units/s² downward acceleration
const JUMP_VELOCITY = 7.5   // units/s upward on jump
const COYOTE_TIME  = 0.12   // seconds after leaving ground where jump is still allowed

// ── Stamina constants ─────────────────────────────────────────────────────────
const STAMINA_DRAIN_RATE  = 25
const STAMINA_REGEN_RATE  = 15
const EXHAUSTION_RECOVERY_THRESHOLD = 25
const STAMINA_SYNC_INTERVAL  = 0.05   // 20 Hz
const POSITION_SYNC_INTERVAL = 2.0

export default function Player({ onLock, onUnlock }) {
  const { camera } = useThree()
  const keys       = useKeyboard()
  const isLocked   = useRef(false)
  const moveDir    = useRef(new Vector3())
  const bobTime    = useRef(0)

  // ── Raycasting (3.1) ─────────────────────────────────────────────────────
  useRaycast()
  const lookingAt = useInteractionStore(state => state.lookingAt)

  // ── Dialogue state (3.4) ─────────────────────────────────────────────────
  const activeDialogue  = useInteractionStore(state => state.activeDialogue)
  const openDialogue    = useInteractionStore(state => state.openDialogue)
  const advanceDialogue = useInteractionStore(state => state.advanceDialogue)

  // ── E key edge detection ──────────────────────────────────────────────────
  const ePressedLastFrame = useRef(false)

  // ── Footstep audio ────────────────────────────────────────────────────────
  const prevSinVal = useRef(0)
  const stepFoot   = useRef('left')

  // ── Stamina refs ──────────────────────────────────────────────────────────
  const staminaRef       = useRef(100)
  const isExhaustedRef   = useRef(false)
  const staminaSyncAccum = useRef(0)

  // ── Physics refs (1.2) ───────────────────────────────────────────────────
  // velocityY: vertical speed (positive = up, negative = falling)
  // lastGroundedTime: clock.elapsedTime of the most recent grounded frame
  // spacePressedLastFrame: edge detection for the Space key
  const velocityY            = useRef(0)
  const lastGroundedTime     = useRef(0)
  const spacePressedLastFrame = useRef(false)

  // ── Position snapshot timer ───────────────────────────────────────────────
  const positionSyncAccum = useRef(0)

  // ── Store actions ─────────────────────────────────────────────────────────
  const setStamina       = useGameStore(state => state.setStamina)
  const savePosition     = useGameStore(state => state.savePosition)
  const equipSlot        = useGameStore(state => state.equipSlot)
  const addInteractedNPC = useWorldStore(state => state.addInteractedNPC)

  const handleLock   = () => { isLocked.current = true;  onLock?.()   }
  const handleUnlock = () => { isLocked.current = false; onUnlock?.() }

  // ── Pointer lock safety ───────────────────────────────────────────────────
  useEffect(() => {
    const release = () => {
      if (document.pointerLockElement) document.exitPointerLock()
    }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
    }
  }, [])

  // ── Inventory hotkeys (1–5) ───────────────────────────────────────────────
  // Guarded by isLocked so slot selection can't happen at the start screen.
  // Also guarded by activeDialogue — during dialogue the number keys drive
  // response selection instead (handled in the dialogue listener below).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isLocked.current) return
      const slot = parseInt(e.key, 10) - 1
      if (slot >= 0 && slot < SLOT_COUNT) equipSlot(slot)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [equipSlot])

  // ── Dialogue keyboard navigation ──────────────────────────────────────────
  // A separate listener with no isLocked guard so it works while the mouse
  // is free (pointer lock released during dialogue).
  useEffect(() => {
    const onKeyDown = (e) => {
      const state = useInteractionStore.getState()
      if (!state.activeDialogue) return

      const idx  = parseInt(e.key, 10) - 1
      if (idx < 0 || idx > 8) return

      const { npcId, nodeKey } = state.activeDialogue
      const node = DIALOGUE[npcId]?.[nodeKey]
      if (!node?.responses[idx]) return

      const next = node.responses[idx].next

      // Number-key close: pointer lock can only be re-requested from a click
      // event, so we just close dialogue and let the start screen handle it.
      state.advanceDialogue(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── Main game loop ────────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    // Block all game logic while dialogue is open OR pointer is not locked.
    // (Dialogue keeps pointer lock released to allow mouse clicks.)
    if (!isLocked.current || activeDialogue) return

    // ── Read input ──────────────────────────────────────────────────────
    const fwd    = (keys.current['KeyW'] || keys.current['ArrowUp'])    ? 1 : 0
    const back   = (keys.current['KeyS'] || keys.current['ArrowDown'])  ? 1 : 0
    const left   = (keys.current['KeyA'] || keys.current['ArrowLeft'])  ? 1 : 0
    const right  = (keys.current['KeyD'] || keys.current['ArrowRight']) ? 1 : 0
    const eDown  = keys.current['KeyE']
    const spaceDown = keys.current['Space']

    moveDir.current.set(right - left, 0, back - fwd)
    const moving = moveDir.current.lengthSq() > 0

    // ── Stamina ─────────────────────────────────────────────────────────
    const sprintPressed = keys.current['ShiftLeft'] || keys.current['ShiftRight']
    const sprintActive  = sprintPressed && moving && !isExhaustedRef.current

    staminaRef.current += (sprintActive ? -STAMINA_DRAIN_RATE : STAMINA_REGEN_RATE) * delta
    staminaRef.current  = Math.max(0, Math.min(100, staminaRef.current))

    if (staminaRef.current <= 0) {
      isExhaustedRef.current = true
    } else if (isExhaustedRef.current && staminaRef.current >= EXHAUSTION_RECOVERY_THRESHOLD) {
      isExhaustedRef.current = false
    }

    staminaSyncAccum.current += delta
    if (staminaSyncAccum.current >= STAMINA_SYNC_INTERVAL) {
      setStamina(staminaRef.current, isExhaustedRef.current)
      staminaSyncAccum.current = 0
    }

    // ── E key — open dialogue ────────────────────────────────────────────
    if (eDown && !ePressedLastFrame.current && lookingAt) {
      const hasInteracted = useWorldStore.getState().interactedNPCs.includes(lookingAt.id)
      const nodeKey = hasInteracted ? 'return_greeting' : 'greeting'
      openDialogue(lookingAt.id, nodeKey)
      addInteractedNPC(lookingAt.id)
      // Release pointer lock so mouse is free to click response buttons
      document.exitPointerLock()
    }
    ePressedLastFrame.current = !!eDown

    // ── XZ movement ─────────────────────────────────────────────────────
    if (moving) {
      moveDir.current.normalize()
      const speed  = sprintActive ? SPRINT_SPEED : WALK_SPEED
      const oldX   = camera.position.x
      const oldZ   = camera.position.z

      camera.translateX(moveDir.current.x * speed * delta)
      camera.translateZ(moveDir.current.z * speed * delta)

      // Collision resolution — slide along walls instead of stopping dead
      const resolved = resolveXZ(camera.position.x, camera.position.z, oldX, oldZ, WORLD_COLLIDERS)
      camera.position.x = resolved.x
      camera.position.z = resolved.z
    }

    // ── World boundary ───────────────────────────────────────────────────
    camera.position.x = Math.max(-120, Math.min(120, camera.position.x))
    camera.position.z = Math.max(-120, Math.min(120, camera.position.z))

    // ── Physics: gravity and jumping (1.2) ──────────────────────────────

    // Track last grounded time for coyote time calculation
    const isGrounded = camera.position.y <= EYE_HEIGHT + 0.01
    if (isGrounded) lastGroundedTime.current = clock.elapsedTime

    // Jump — allowed while grounded OR within the coyote time window
    const canJump = clock.elapsedTime - lastGroundedTime.current < COYOTE_TIME
    if (spaceDown && !spacePressedLastFrame.current && canJump) {
      velocityY.current  = JUMP_VELOCITY
      lastGroundedTime.current = -Infinity  // exhaust coyote window to prevent double-jump
    }
    spacePressedLastFrame.current = !!spaceDown

    // Integrate gravity
    velocityY.current -= GRAVITY * delta
    camera.position.y += velocityY.current * delta

    // Ground snap
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT
      velocityY.current = 0
    }

    // ── Head bob (only while grounded and moving) ────────────────────────
    if (moving && camera.position.y <= EYE_HEIGHT + 0.01) {
      const freq = sprintActive ? BOB_SPRINT_FREQ : BOB_WALK_FREQ
      bobTime.current += delta * freq
      camera.position.y = EYE_HEIGHT + Math.sin(bobTime.current) * BOB_AMPLITUDE
    } else if (!moving) {
      bobTime.current  = 0
      prevSinVal.current = 0
      // Smoothly return to eye height when not moving (only while grounded)
      if (camera.position.y <= EYE_HEIGHT + BOB_AMPLITUDE * 2) {
        camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.15
      }
    }

    // ── Footstep audio ───────────────────────────────────────────────────
    if (moving && camera.position.y <= EYE_HEIGHT + 0.01) {
      const sinNow   = Math.sin(bobTime.current)
      const crossedDown = prevSinVal.current >= 0 && sinNow < 0
      const crossedUp   = prevSinVal.current <  0 && sinNow >= 0
      if (crossedDown || crossedUp) {
        playFootstep('grass', sprintActive ? 0.55 : 0.35)
        stepFoot.current = stepFoot.current === 'left' ? 'right' : 'left'
      }
      prevSinVal.current = sinNow
    }

    // ── Position snapshot → store ────────────────────────────────────────
    positionSyncAccum.current += delta
    if (positionSyncAccum.current >= POSITION_SYNC_INTERVAL) {
      savePosition({ x: camera.position.x, y: camera.position.y, z: camera.position.z })
      positionSyncAccum.current = 0
    }
  })

  return (
    <PointerLockControls onLock={handleLock} onUnlock={handleUnlock} />
  )
}
