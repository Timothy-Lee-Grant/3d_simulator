import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Vector3 } from 'three'
import useKeyboard from '../hooks/useKeyboard'
import { playFootstep } from '../systems/AudioManager'

const WALK_SPEED  = 7.0
const SPRINT_SPEED = 14.0
const EYE_HEIGHT  = 1.7
const BOB_WALK_FREQ   = 7
const BOB_SPRINT_FREQ = 12
const BOB_AMPLITUDE   = 0.045

/**
 * Player — handles first-person camera movement and mouse look.
 *
 * PointerLockControls (from Drei) owns rotation: it captures the mouse
 * and applies yaw/pitch to the camera on each mouse move event.
 *
 * useFrame owns translation: every frame we read the keyboard state and
 * move the camera forward/back/left/right in its own local space, so the
 * player always moves in the direction they're facing.
 */
export default function Player({ onLock, onUnlock }) {
  const { camera } = useThree()
  const keys     = useKeyboard()
  const isLocked  = useRef(false)
  const moveDir   = useRef(new Vector3())
  const bobTime   = useRef(0)

  // ── Footstep state ────────────────────────────────────────────────────
  // We detect footsteps by watching the sign of Math.sin(bobTime).
  // The sine wave completes one full cycle per stride (two steps).
  // Each time the wave crosses zero — once going down, once going up —
  // that's one footstep. This perfectly syncs audio to the visual bob.
  const prevSinVal = useRef(0)
  const stepFoot   = useRef('left')   // alternates L/R for future directional audio

  const handleLock   = () => { isLocked.current = true;  onLock?.()   }
  const handleUnlock = () => { isLocked.current = false; onUnlock?.() }

  // ── Release lock when user leaves the browser window ─────────────────
  // The Pointer Lock API captures the mouse even when the physical cursor
  // moves outside the browser window. Without this, the user is trapped —
  // they cannot click browser chrome, other apps, or their OS taskbar.
  //
  // Two events cover all exit paths:
  //   • 'blur'             — window lost focus (Alt+Tab, clicked another app,
  //                          clicked the OS taskbar/dock)
  //   • 'visibilitychange' — tab hidden (switched tabs, minimised browser)
  useEffect(() => {
    const release = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
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

    // ── Read input ────────────────────────────────────────────────────
    const fwd    = (keys.current['KeyW'] || keys.current['ArrowUp'])    ? 1 : 0
    const back   = (keys.current['KeyS'] || keys.current['ArrowDown'])  ? 1 : 0
    const left   = (keys.current['KeyA'] || keys.current['ArrowLeft'])  ? 1 : 0
    const right  = (keys.current['KeyD'] || keys.current['ArrowRight']) ? 1 : 0
    const sprint = keys.current['ShiftLeft'] || keys.current['ShiftRight']

    // ── Translate in camera-local space ───────────────────────────────
    moveDir.current.set(right - left, 0, back - fwd)
    const moving = moveDir.current.lengthSq() > 0

    if (moving) {
      moveDir.current.normalize()
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED
      camera.translateX(moveDir.current.x * speed * delta)
      camera.translateZ(moveDir.current.z * speed * delta)
    }

    // ── Head bob ──────────────────────────────────────────────────────
    if (moving) {
      const freq = sprint ? BOB_SPRINT_FREQ : BOB_WALK_FREQ
      bobTime.current += delta * freq
      camera.position.y = EYE_HEIGHT + Math.sin(bobTime.current) * BOB_AMPLITUDE
    } else {
      bobTime.current = 0
      prevSinVal.current = 0   // reset so next movement starts cleanly
      // Smoothly return to eye height when stopped
      camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.15
    }

    // ── Footstep audio ────────────────────────────────────────────────
    // Detect every zero-crossing of sin(bobTime).
    // The sine wave has two zero crossings per cycle:
    //   positive → negative crossing: one foot hits the ground
    //   negative → positive crossing: other foot hits the ground
    // This gives exactly two footstep sounds per full bob cycle,
    // perfectly synchronized with the up-down camera motion.
    if (moving) {
      const sinNow = Math.sin(bobTime.current)
      const sinWas = prevSinVal.current

      const crossedDown = sinWas >= 0 && sinNow < 0   // + → −
      const crossedUp   = sinWas <  0 && sinNow >= 0  // − → +

      if (crossedDown || crossedUp) {
        const vol = sprint ? 0.55 : 0.35
        playFootstep('grass', vol)
        stepFoot.current = stepFoot.current === 'left' ? 'right' : 'left'
      }

      prevSinVal.current = sinNow
    }

    // ── World boundary ────────────────────────────────────────────────
    camera.position.x = Math.max(-120, Math.min(120, camera.position.x))
    camera.position.z = Math.max(-120, Math.min(120, camera.position.z))
  })

  return (
    <PointerLockControls onLock={handleLock} onUnlock={handleUnlock} />
  )
}
