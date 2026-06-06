/**
 * Player — first-person camera movement, mouse look, stamina, and interaction.
 *
 * PointerLockControls (from Drei) owns rotation: it captures the mouse
 * and applies yaw/pitch to the camera on each mouse move event.
 *
 * useFrame owns translation and all per-frame game logic: movement, head bob,
 * footstep audio, stamina drain/regen, E key interaction, and periodic store syncs.
 *
 * ── Stamina: Refs vs Store ────────────────────────────────────────────────
 *
 * Stamina changes every frame while sprinting (~25 units/sec drained at 60fps =
 * 0.42 units per frame). If we called setStamina(newValue) every frame, the
 * Overlay would re-render 60 times per second — technically fine, but wasteful.
 *
 * Instead, the stamina value lives in a ref (staminaRef) for per-frame math,
 * and only syncs to the Zustand store every 50ms (at ~20Hz). The Overlay
 * re-renders 20 times/sec during sprinting — smooth enough for a bar display.
 *
 * The isExhausted flag is synced alongside the stamina value in the same call
 * to avoid two consecutive store writes per sync cycle.
 *
 * ── Position sync ─────────────────────────────────────────────────────────
 *
 * camera.position is a Three.js Vector3 — it exists outside React state and
 * is mutated directly by PointerLockControls and our translateX/Z calls.
 * For the save/load system (Phase 7), we need to know the player's last position
 * in plain JS data. We snapshot camera.position into the store every 2 seconds.
 */

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Vector3 } from 'three'
import useKeyboard from '../hooks/useKeyboard'
import useRaycast from '../hooks/useRaycast'
import { playFootstep } from '../systems/AudioManager'
import { useInteractionStore } from '../store/useInteractionStore'
import { useGameStore } from '../store/useGameStore'
import { useWorldStore } from '../store/useWorldStore'

// ── Movement constants ────────────────────────────────────────────────────────
const WALK_SPEED     = 7.0
const SPRINT_SPEED   = 14.0
const EYE_HEIGHT     = 1.7
const BOB_WALK_FREQ  = 7
const BOB_SPRINT_FREQ = 12
const BOB_AMPLITUDE  = 0.045

// ── Stamina constants ─────────────────────────────────────────────────────────
const STAMINA_DRAIN_RATE  = 25    // units per second while sprinting + moving
const STAMINA_REGEN_RATE  = 15    // units per second while not sprinting
// Below this threshold, exhaustion clears and sprint can resume.
// Set to 25% so the player can't immediately exhaust → recover → exhaust.
const EXHAUSTION_RECOVERY_THRESHOLD = 25
// How often to sync local stamina ref → Zustand store (seconds)
const STAMINA_SYNC_INTERVAL  = 0.05   // 20 Hz
// How often to snapshot camera position → store (seconds)
const POSITION_SYNC_INTERVAL = 2.0    // once every 2 seconds

export default function Player({ onLock, onUnlock }) {
  const { camera } = useThree()
  const keys      = useKeyboard()
  const isLocked  = useRef(false)
  const moveDir   = useRef(new Vector3())
  const bobTime   = useRef(0)

  // ── Raycasting (interaction system from 3.1) ──────────────────────────────
  useRaycast()
  const lookingAt = useInteractionStore(state => state.lookingAt)
  const interact  = useInteractionStore(state => state.interact)

  // ── E key edge detection ──────────────────────────────────────────────────
  const ePressedLastFrame = useRef(false)

  // ── Footstep audio ────────────────────────────────────────────────────────
  const prevSinVal = useRef(0)
  const stepFoot   = useRef('left')

  // ── Stamina (local refs — fast, no re-renders) ────────────────────────────
  // staminaRef holds the "real" current value used for frame-accurate arithmetic.
  // isExhaustedRef is the sprint-lock flag derived from staminaRef.
  // Both are synced to the store at STAMINA_SYNC_INTERVAL.
  const staminaRef      = useRef(100)
  const isExhaustedRef  = useRef(false)
  const staminaSyncAccum = useRef(0)

  // ── Position snapshot timer ───────────────────────────────────────────────
  const positionSyncAccum = useRef(0)

  // ── Store actions (stable references — safe to call inside useFrame) ──────
  // Subscribing to an action never causes a re-render because Zustand actions
  // are created once and their reference never changes.
  const setStamina       = useGameStore(state => state.setStamina)
  const savePosition     = useGameStore(state => state.savePosition)
  const addInteractedNPC = useWorldStore(state => state.addInteractedNPC)

  const handleLock   = () => { isLocked.current = true;  onLock?.()   }
  const handleUnlock = () => { isLocked.current = false; onUnlock?.() }

  // ── Release pointer lock when the window loses focus ─────────────────────
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

  useFrame((_, delta) => {
    if (!isLocked.current) return

    // ── Read input ────────────────────────────────────────────────────────
    const fwd    = (keys.current['KeyW'] || keys.current['ArrowUp'])    ? 1 : 0
    const back   = (keys.current['KeyS'] || keys.current['ArrowDown'])  ? 1 : 0
    const left   = (keys.current['KeyA'] || keys.current['ArrowLeft'])  ? 1 : 0
    const right  = (keys.current['KeyD'] || keys.current['ArrowRight']) ? 1 : 0
    const eDown  = keys.current['KeyE']

    // ── Stamina: drain while sprinting, regen while not ───────────────────
    // Sprint is only "real" sprinting if the player is also moving.
    // Holding Shift while standing still should not drain stamina.
    moveDir.current.set(right - left, 0, back - fwd)
    const moving = moveDir.current.lengthSq() > 0

    // Sprint is blocked while exhausted, regardless of Shift key
    const sprintPressed  = keys.current['ShiftLeft'] || keys.current['ShiftRight']
    const sprintActive   = sprintPressed && moving && !isExhaustedRef.current

    if (sprintActive) {
      staminaRef.current -= STAMINA_DRAIN_RATE * delta
    } else {
      staminaRef.current += STAMINA_REGEN_RATE * delta
    }
    staminaRef.current = Math.max(0, Math.min(100, staminaRef.current))

    // ── Exhaustion state machine ──────────────────────────────────────────
    // Enter exhaustion when stamina hits 0.
    // Clear exhaustion when stamina recovers to the threshold.
    // The threshold gap (0 → 25 to recover) prevents jitter at the boundary.
    if (staminaRef.current <= 0) {
      isExhaustedRef.current = true
    } else if (isExhaustedRef.current && staminaRef.current >= EXHAUSTION_RECOVERY_THRESHOLD) {
      isExhaustedRef.current = false
    }

    // ── Sync stamina to store at 20Hz ─────────────────────────────────────
    staminaSyncAccum.current += delta
    if (staminaSyncAccum.current >= STAMINA_SYNC_INTERVAL) {
      setStamina(staminaRef.current, isExhaustedRef.current)
      staminaSyncAccum.current = 0
    }

    // ── Interaction: E key ────────────────────────────────────────────────
    if (eDown && !ePressedLastFrame.current && lookingAt) {
      interact(lookingAt)
      addInteractedNPC(lookingAt.id)   // record in world store (persists for save/load)
    }
    ePressedLastFrame.current = !!eDown

    // ── Translate in camera-local space ───────────────────────────────────
    if (moving) {
      moveDir.current.normalize()
      const speed = sprintActive ? SPRINT_SPEED : WALK_SPEED
      camera.translateX(moveDir.current.x * speed * delta)
      camera.translateZ(moveDir.current.z * speed * delta)
    }

    // ── Head bob ──────────────────────────────────────────────────────────
    if (moving) {
      const freq = sprintActive ? BOB_SPRINT_FREQ : BOB_WALK_FREQ
      bobTime.current += delta * freq
      camera.position.y = EYE_HEIGHT + Math.sin(bobTime.current) * BOB_AMPLITUDE
    } else {
      bobTime.current = 0
      prevSinVal.current = 0
      camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.15
    }

    // ── Footstep audio ────────────────────────────────────────────────────
    if (moving) {
      const sinNow = Math.sin(bobTime.current)
      const sinWas = prevSinVal.current
      const crossedDown = sinWas >= 0 && sinNow < 0
      const crossedUp   = sinWas <  0 && sinNow >= 0

      if (crossedDown || crossedUp) {
        playFootstep('grass', sprintActive ? 0.55 : 0.35)
        stepFoot.current = stepFoot.current === 'left' ? 'right' : 'left'
      }
      prevSinVal.current = sinNow
    }

    // ── World boundary ────────────────────────────────────────────────────
    camera.position.x = Math.max(-120, Math.min(120, camera.position.x))
    camera.position.z = Math.max(-120, Math.min(120, camera.position.z))

    // ── Position snapshot → store ─────────────────────────────────────────
    // Stores a plain-JS copy of camera position for the save/load system.
    // The Three.js camera.position Vector3 is not serialisable, so we extract
    // the three floats into a plain object.
    positionSyncAccum.current += delta
    if (positionSyncAccum.current >= POSITION_SYNC_INTERVAL) {
      savePosition({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      })
      positionSyncAccum.current = 0
    }
  })

  return (
    <PointerLockControls onLock={handleLock} onUnlock={handleUnlock} />
  )
}
